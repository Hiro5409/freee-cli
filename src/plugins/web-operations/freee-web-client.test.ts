import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";

import * as v from "valibot";

import { OutcomeUnknownError } from "../../errors.ts";
import { createFreeeWebClient } from "./freee-web-client.ts";
import type { RunSubprocess, SubprocessOptions, SubprocessResult } from "./subprocess.ts";

const origin = "https://secure.freee.co.jp";
const encryptedEnvironment = { AGENT_BROWSER_ENCRYPTION_KEY: "a".repeat(64) };

function expectedSessionId(prefix: string, companyId: number, authProfile: string): string {
  const profileKey = createHash("sha256").update(authProfile).digest("hex").slice(0, 16);
  return `${prefix}-${companyId}-${profileKey}`;
}

function success(data: unknown): SubprocessResult {
  return {
    exitCode: 0,
    timedOut: false,
    stdout: JSON.stringify({ success: true, data, error: null }),
    stderr: "",
  };
}

type Call = { command: readonly string[]; options?: SubprocessOptions };

function scriptedRun(
  values: SubprocessResult[],
  stateFiles: Array<{ filename: string; encrypted: boolean }> = [],
) {
  const calls: Call[] = [];
  const run: RunSubprocess = async (command, options) => {
    calls.push({ command, options });
    if (command.join(" ") === "agent-browser --namespace freee-web state list --json") {
      return success({ files: stateFiles });
    }
    const value = values.shift();
    if (!value) throw new Error("unexpected subprocess call");
    return value;
  };
  return { calls, run };
}

function createClient(
  input: Omit<Parameters<typeof createFreeeWebClient>[0], "authProfile"> & {
    authProfile?: string;
  },
) {
  const { authProfile = "freee-web", environment = encryptedEnvironment, ...clientInput } = input;
  return createFreeeWebClient({ ...clientInput, authProfile, environment });
}

async function withClient<T>(
  client: ReturnType<typeof createFreeeWebClient>,
  operation: () => Promise<T>,
): Promise<T> {
  try {
    return await operation();
  } finally {
    await client.close();
  }
}

describe("FreeeWebClient", () => {
  test("uses a deterministic restored session and sends scripts over stdin", async () => {
    const { calls, run } = scriptedRun([
      success(null),
      success({ result: JSON.stringify({ origin, companyId: 123 }) }),
      success({
        result: JSON.stringify({ origin, status: 200, body: JSON.stringify({ ok: true }) }),
      }),
      success(null),
    ]);
    const client = createClient({ companyId: 123, run });

    await expect(
      withClient(client, () =>
        client.request(
          { method: "GET", path: "/api/p/example" },
          v.strictObject({ ok: v.literal(true) }),
        ),
      ),
    ).resolves.toEqual({ ok: true });

    expect(calls.flatMap(({ command }) => command)).toContain(
      expectedSessionId("fw", 123, "freee-web"),
    );
    const evalCalls = calls.filter(({ command }) => command.includes("eval"));
    expect(evalCalls).toHaveLength(2);
    for (const call of evalCalls) {
      expect(call.command).toContain("--stdin");
      expect(call.command.join(" ")).not.toContain("/api/p/example");
      expect(call.options?.stdin).toBeTruthy();
    }
    expect(evalCalls.at(-1)?.options?.stdin).toContain("/api/p/example");
  });

  test("logs in through the Auth Profile when the restored session is unauthenticated", async () => {
    const { calls, run } = scriptedRun([
      success(null),
      success({
        result: JSON.stringify({
          origin: "https://accounts.secure.freee.co.jp",
          companyId: 0,
        }),
      }),
      success(null),
      success(null),
      success({ result: JSON.stringify({ origin, companyId: 123 }) }),
      success({
        result: JSON.stringify({ origin, status: 200, body: JSON.stringify({ ok: true }) }),
      }),
      success(null),
    ]);
    const client = createClient({ companyId: 123, authProfile: "business-freee", run });

    await withClient(client, () =>
      client.request(
        { method: "GET", path: "/api/p/example" },
        v.strictObject({ ok: v.literal(true) }),
      ),
    );

    expect(calls.flatMap(({ command }) => command)).toContain(
      expectedSessionId("fw", 123, "business-freee"),
    );
    expect(calls.find(({ command }) => command.includes("auth"))?.command.slice(-3)).toEqual([
      "auth",
      "login",
      "business-freee",
    ]);
  });

  test("rejects an unencrypted restore state before opening the browser", async () => {
    const { calls, run } = scriptedRun(
      [],
      [{ filename: `${expectedSessionId("fw", 123, "freee-web")}-state.json`, encrypted: false }],
    );
    const client = createClient({ companyId: 123, run });

    await expect(
      withClient(client, () =>
        client.request({ method: "GET", path: "/api/p/example" }, v.unknown()),
      ),
    ).rejects.toThrow("unencrypted saved state");
    expect(calls.some(({ command }) => command.includes("--restore"))).toBe(false);
  });

  test("explains how to create a missing Auth Profile", async () => {
    const { run } = scriptedRun([
      success(null),
      success({
        result: JSON.stringify({
          origin: "https://accounts.secure.freee.co.jp",
          companyId: 0,
        }),
      }),
      {
        exitCode: 1,
        timedOut: false,
        stdout: JSON.stringify({ success: false, error: "Auth Profile not found" }),
        stderr: "",
      },
      success(null),
    ]);
    const client = createClient({ companyId: 123, run });

    await expect(
      withClient(client, () =>
        client.request({ method: "GET", path: "/api/p/example" }, v.unknown()),
      ),
    ).rejects.toThrow("agent-browser auth save freee-web --url https://secure.freee.co.jp/");
  });

  test("rejects a different company before sending a Web request", async () => {
    const { calls, run } = scriptedRun([
      success(null),
      success({ result: JSON.stringify({ origin, companyId: 999 }) }),
      success(null),
    ]);
    const client = createClient({ companyId: 123, run });

    await expect(
      withClient(client, () =>
        client.request({ method: "GET", path: "/api/p/example" }, v.unknown()),
      ),
    ).rejects.toThrow("expected 123");
    expect(calls.filter(({ command }) => command.includes("eval"))).toHaveLength(1);
  });

  test("fails closed when the Web response does not match its observed schema", async () => {
    const { run } = scriptedRun([
      success(null),
      success({ result: JSON.stringify({ origin, companyId: 123 }) }),
      success({
        result: JSON.stringify({ origin, status: 200, body: JSON.stringify({ ok: "wrong" }) }),
      }),
      success(null),
    ]);
    const client = createClient({ companyId: 123, run });

    await expect(
      withClient(client, () =>
        client.request(
          { method: "GET", path: "/api/p/example" },
          v.strictObject({ ok: v.boolean() }),
        ),
      ),
    ).rejects.toThrow("response format");
  });

  test("adds CSRF protection to mutation requests", async () => {
    const { calls, run } = scriptedRun([
      success(null),
      success({ result: JSON.stringify({ origin, companyId: 123 }) }),
      success({
        result: JSON.stringify({ origin, status: 200, body: JSON.stringify({ ok: true }) }),
      }),
      success(null),
    ]);
    const client = createClient({ companyId: 123, run });

    await withClient(client, () =>
      client.request(
        { method: "PUT", path: "/api/p/example" },
        v.strictObject({ ok: v.literal(true) }),
      ),
    );

    const requestScript = calls.filter(({ command }) => command.includes("eval")).at(-1)
      ?.options?.stdin;
    expect(requestScript).toContain("X-CSRF-Token");
    expect(requestScript).toContain("application/x-www-form-urlencoded");
  });

  test("classifies a timed-out mutation as outcome unknown", async () => {
    const { run } = scriptedRun([
      success(null),
      success({ result: JSON.stringify({ origin, companyId: 123 }) }),
      { exitCode: 143, timedOut: true, stdout: "", stderr: "" },
      success(null),
    ]);
    const client = createClient({ companyId: 123, run });

    const result = withClient(client, () =>
      client.request(
        { method: "PUT", path: "/api/p/example" },
        v.strictObject({ ok: v.literal(true) }),
      ),
    );

    await expect(result).rejects.toBeInstanceOf(OutcomeUnknownError);
    await expect(result).rejects.toMatchObject({ code: "OUTCOME_UNKNOWN" });
  });

  test("classifies a mutation 5xx as outcome unknown but keeps 4xx definite", async () => {
    for (const status of [400, 500]) {
      const { run } = scriptedRun([
        success(null),
        success({ result: JSON.stringify({ origin, companyId: 123 }) }),
        success({ result: JSON.stringify({ origin, status, body: "{}" }) }),
        success(null),
      ]);
      const client = createClient({ companyId: 123, run });
      const result = withClient(client, () =>
        client.request({ method: "PUT", path: "/api/p/example" }, v.unknown()),
      );

      if (status === 500) {
        await expect(result).rejects.toBeInstanceOf(OutcomeUnknownError);
      } else {
        await expect(result).rejects.toThrow("HTTP 400");
      }
    }
  });

  test("refuses to persist a financial session without encryption", async () => {
    let called = false;
    const run: RunSubprocess = async () => {
      called = true;
      throw new Error("unexpected subprocess call");
    };

    const client = createFreeeWebClient({
      companyId: 123,
      authProfile: "freee-web",
      environment: {},
      run,
    });
    await expect(
      client.request({ method: "GET", path: "/api/p/example" }, v.unknown()),
    ).rejects.toThrow("AGENT_BROWSER_ENCRYPTION_KEY");
    expect(called).toBe(false);
  });

  test("does not start Agent Browser when an unused client is closed", async () => {
    const { calls, run } = scriptedRun([]);
    const client = createClient({ companyId: 123, run });

    await client.close();

    expect(calls).toEqual([]);
  });

  test("closes the initialized restored session", async () => {
    const { calls, run } = scriptedRun([
      success(null),
      success({ result: JSON.stringify({ origin, companyId: 123 }) }),
      success({
        result: JSON.stringify({ origin, status: 200, body: JSON.stringify({ ok: true }) }),
      }),
      success(null),
    ]);
    const client = createClient({ companyId: 123, authProfile: "business-freee", run });

    await client.request(
      { method: "GET", path: "/api/p/example" },
      v.strictObject({ ok: v.literal(true) }),
    );
    await client.close();

    expect(calls.at(-1)?.command).toEqual([
      "agent-browser",
      "--namespace",
      "freee-web",
      "--session",
      expectedSessionId("fw", 123, "business-freee"),
      "--restore",
      "--json",
      "close",
    ]);
  });
});
