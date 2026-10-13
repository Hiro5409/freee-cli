import { createHash, randomUUID } from "node:crypto";
import { linkSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import * as v from "valibot";

import { runSubprocess, type RunSubprocess, type SubprocessResult } from "./subprocess.ts";

const EncryptionKeySchema = v.pipe(v.string(), v.regex(/^[A-Fa-f0-9]{64}$/));
const AgentBrowserOutputSchema = v.object({
  success: v.boolean(),
  data: v.optional(v.unknown()),
  error: v.optional(v.nullable(v.unknown())),
});
const AgentBrowserEvalDataSchema = v.object({ result: v.string() });
const AgentBrowserStateListSchema = v.object({
  files: v.array(v.object({ filename: v.string(), encrypted: v.boolean() })),
});
const SessionLockOwnerSchema = v.object({
  pid: v.pipe(v.number(), v.integer(), v.minValue(1)),
  token: v.string(),
});

export type AgentBrowserSession = {
  namespace: string;
  sessionId: string;
  dispose(): Promise<void>;
  evaluate(script: string): Promise<string>;
  run(command: readonly string[]): Promise<unknown>;
};

type SessionLock = { release(): void };

function removeLockFile(path: string): void {
  try {
    unlinkSync(path);
  } catch (error) {
    if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
  }
}

function lockOwner(path: string): v.InferOutput<typeof SessionLockOwnerSchema> | undefined {
  try {
    const owner = v.safeParse(SessionLockOwnerSchema, JSON.parse(readFileSync(path, "utf8")));
    return owner.success ? owner.output : undefined;
  } catch {
    return undefined;
  }
}

function processIsRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error instanceof Error && "code" in error && error.code === "EPERM";
  }
}

function acquireSessionLock(namespace: string, sessionId: string): SessionLock {
  const directory = join(tmpdir(), "freee-cli-agent-browser-locks");
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const key = createHash("sha256").update(`${namespace}:${sessionId}`).digest("hex");
  const token = randomUUID();
  const ownerPath = join(directory, `${key}-${token}.owner`);
  const lockPath = join(directory, `${key}.lock`);
  const recoveryPath = join(directory, `${key}.recovery`);
  writeFileSync(ownerPath, JSON.stringify({ pid: process.pid, token }), {
    encoding: "utf8",
    flag: "wx",
    mode: 0o600,
  });

  const claim = (): boolean => {
    try {
      linkSync(ownerPath, lockPath);
      return true;
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "EEXIST") return false;
      throw error;
    }
  };

  try {
    if (!claim()) {
      const current = lockOwner(lockPath);
      if (!current || processIsRunning(current.pid)) {
        throw new Error("This freee Web browser session is already in use.");
      }

      try {
        linkSync(ownerPath, recoveryPath);
      } catch (error) {
        if (error instanceof Error && "code" in error && error.code === "EEXIST") {
          throw new Error("This freee Web browser session is already in use.", { cause: error });
        }
        throw error;
      }
      try {
        const latest = lockOwner(lockPath);
        if (!latest || latest.token !== current.token || processIsRunning(latest.pid)) {
          throw new Error("This freee Web browser session is already in use.");
        }
        removeLockFile(lockPath);
        removeLockFile(join(directory, `${key}-${latest.token}.owner`));
        if (!claim()) throw new Error("This freee Web browser session is already in use.");
      } finally {
        removeLockFile(recoveryPath);
      }
    }
  } catch (error) {
    removeLockFile(ownerPath);
    throw error;
  }

  let released = false;
  return {
    release() {
      if (released) return;
      released = true;
      if (lockOwner(lockPath)?.token === token) removeLockFile(lockPath);
      removeLockFile(ownerPath);
    },
  };
}

function encryptionKey(environment: Record<string, string | undefined>): string {
  const configured = v.safeParse(EncryptionKeySchema, environment.AGENT_BROWSER_ENCRYPTION_KEY);
  if (configured.success) return configured.output;

  const home = environment.HOME ?? environment.USERPROFILE;
  if (home) {
    try {
      const stored = v.safeParse(
        EncryptionKeySchema,
        readFileSync(join(home, ".agent-browser", ".encryption-key"), "utf8").trim(),
      );
      if (stored.success) return stored.output;
    } catch (error) {
      if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
    }
  }

  throw new Error(
    "AGENT_BROWSER_ENCRYPTION_KEY must be 64 hexadecimal characters or ~/.agent-browser/.encryption-key must contain one before browser sessions can be persisted.",
  );
}

function errorText(value: unknown): string {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "message" in value) {
    const message = value.message;
    if (typeof message === "string") return message;
  }
  return value === null || value === undefined ? "" : JSON.stringify(value);
}

function parseAgentBrowserOutput(result: SubprocessResult): unknown {
  let output: unknown;
  try {
    output = JSON.parse(result.stdout);
  } catch (error) {
    if (result.exitCode !== 0 && result.stderr.trim()) {
      throw new Error(result.stderr.trim(), { cause: error });
    }
    throw new Error("Agent Browser returned invalid JSON.", { cause: error });
  }
  const parsed = v.safeParse(AgentBrowserOutputSchema, output);
  if (!parsed.success) {
    throw new Error("Agent Browser returned an unexpected response.", { cause: parsed.issues });
  }
  if (result.exitCode !== 0 || !parsed.output.success) {
    throw new Error(
      errorText(parsed.output.error) ||
        result.stderr.trim() ||
        `Agent Browser exited with code ${result.exitCode}.`,
    );
  }
  return parsed.output.data;
}

async function assertEncryptedRestoreState(
  command: readonly string[],
  sessionId: string,
  run: RunSubprocess,
  environment: Record<string, string | undefined>,
): Promise<void> {
  let result;
  try {
    result = await run([...command, "state", "list", "--json"], { environment });
  } catch (error) {
    throw new Error(
      'Agent Browser is required. Install it and verify it with "agent-browser --version".',
      { cause: error },
    );
  }
  if (result.timedOut) throw new Error("Agent Browser state lookup timed out.");
  const parsed = v.safeParse(AgentBrowserStateListSchema, parseAgentBrowserOutput(result));
  if (!parsed.success) {
    throw new Error("Agent Browser state list returned an unexpected response.", {
      cause: parsed.issues,
    });
  }
  const hasPlaintextState = parsed.output.files.some(
    ({ encrypted, filename }) =>
      !encrypted && filename.startsWith(`${sessionId}-`) && filename.endsWith(".json"),
  );
  if (hasPlaintextState) {
    throw new Error(
      `Agent Browser has an unencrypted saved state for session "${sessionId}". Move or remove the matching .json state before retrying.`,
    );
  }
}

export async function createAgentBrowserSession(input: {
  namespace: string;
  sessionPrefix: string;
  companyId: number;
  authProfile: string;
  environment?: Record<string, string | undefined>;
  run?: RunSubprocess;
}): Promise<AgentBrowserSession> {
  const sourceEnvironment = input.environment ?? process.env;
  const environment = {
    ...sourceEnvironment,
    AGENT_BROWSER_ENCRYPTION_KEY: encryptionKey(sourceEnvironment),
  };
  for (const [name, value] of [
    ["namespace", input.namespace],
    ["session prefix", input.sessionPrefix],
    ["auth profile", input.authProfile],
  ] as const) {
    if (!/^[A-Za-z0-9_-]+$/.test(value)) {
      throw new Error(`The Agent Browser ${name} is invalid.`);
    }
  }

  const run = input.run ?? runSubprocess;
  const command = ["agent-browser", "--namespace", input.namespace] as const;
  const profileKey = createHash("sha256").update(input.authProfile).digest("hex").slice(0, 16);
  const sessionId = `${input.sessionPrefix}-${input.companyId}-${profileKey}`;
  const lock = acquireSessionLock(input.namespace, sessionId);
  try {
    await assertEncryptedRestoreState(command, sessionId, run, environment);
  } catch (error) {
    lock.release();
    throw error;
  }
  let state: "open" | "disposing" | "disposed" = "open";
  let disposeOperation: Promise<void> | undefined;

  async function executeUnchecked(
    agentCommand: readonly string[],
    stdin?: string,
  ): Promise<unknown> {
    const result = await run(
      [...command, "--session", sessionId, "--restore", "--json", ...agentCommand],
      { environment, stdin },
    );
    if (result.timedOut) throw new Error("Agent Browser timed out.");
    return parseAgentBrowserOutput(result);
  }

  function assertOpen(): void {
    if (state !== "open") {
      throw new Error(`Agent Browser session is ${state}.`);
    }
  }

  async function execute(agentCommand: readonly string[], stdin?: string): Promise<unknown> {
    assertOpen();
    return executeUnchecked(agentCommand, stdin);
  }

  return {
    namespace: input.namespace,
    sessionId,
    async dispose() {
      if (state === "disposed") return;
      if (disposeOperation) return disposeOperation;
      state = "disposing";
      disposeOperation = executeUnchecked(["close"])
        .then(() => undefined)
        .finally(() => {
          state = "disposed";
          lock.release();
          disposeOperation = undefined;
        });
      return disposeOperation;
    },
    async evaluate(script) {
      const data = v.parse(AgentBrowserEvalDataSchema, await execute(["eval", "--stdin"], script));
      return data.result;
    },
    run: (agentCommand) => execute(agentCommand),
  };
}
