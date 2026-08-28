import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";

import { createAgentBrowserSession } from "./agent-browser.ts";
import type { RunSubprocess, SubprocessResult } from "./subprocess.ts";

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

function failure(message: string): SubprocessResult {
  return {
    exitCode: 1,
    timedOut: false,
    stdout: JSON.stringify({ success: false, data: null, error: message }),
    stderr: "",
  };
}

describe("Agent Browser session", () => {
  test("derives restored state from company and Auth Profile without caller cwd", async () => {
    const calls: Array<{
      command: readonly string[];
      environment?: Record<string, string | undefined>;
    }> = [];
    const responses = [success({ files: [] }), success(null), success(null)];
    const run: RunSubprocess = async (command, options) => {
      calls.push({ command: [...command], environment: options?.environment });
      const response = responses.shift();
      if (!response) throw new Error("unexpected subprocess call");
      return response;
    };

    const browser = await createAgentBrowserSession({
      namespace: "freee-web-bookkeeping",
      sessionPrefix: "fb",
      companyId: 123,
      authProfile: "business-freee",
      environment: encryptedEnvironment,
      run,
    });
    await browser.run(["open", "https://secure.freee.co.jp/"]);
    await browser.dispose();

    expect(calls[0]?.command).toEqual([
      "agent-browser",
      "--namespace",
      "freee-web-bookkeeping",
      "state",
      "list",
      "--json",
    ]);
    expect(calls[1]?.command).toContain(expectedSessionId("fb", 123, "business-freee"));
    expect(calls.flatMap(({ command }) => command)).not.toContain("worktree");
    expect(
      calls.every(
        ({ environment }) => environment?.AGENT_BROWSER_ENCRYPTION_KEY === "a".repeat(64),
      ),
    ).toBe(true);
  });

  test("rejects a second owner of the same restored session", async () => {
    let calls = 0;
    const run: RunSubprocess = async (command) => {
      calls += 1;
      return command.includes("state") ? success({ files: [] }) : success(null);
    };
    const input = {
      namespace: `freee-web-lock-${process.pid}`,
      sessionPrefix: "lock",
      companyId: 987_654,
      authProfile: "business-freee",
      environment: encryptedEnvironment,
      run,
    } as const;

    const first = await createAgentBrowserSession(input);
    await expect(createAgentBrowserSession(input)).rejects.toThrow("already in use");
    expect(calls).toBe(1);

    await first.dispose();
    const second = await createAgentBrowserSession(input);
    await second.dispose();
  });

  test("rejects operations after the restored session is disposed", async () => {
    let calls = 0;
    const run: RunSubprocess = async (command) => {
      calls += 1;
      return command.includes("state") ? success({ files: [] }) : success(null);
    };
    const browser = await createAgentBrowserSession({
      namespace: `freee-web-closed-${process.pid}`,
      sessionPrefix: "closed",
      companyId: 123,
      authProfile: "business-freee",
      environment: encryptedEnvironment,
      run,
    });

    await browser.dispose();
    await expect(browser.run(["open", "https://secure.freee.co.jp/"])).rejects.toThrow(
      "is disposed",
    );
    await expect(browser.evaluate("document.title")).rejects.toThrow("is disposed");
    expect(calls).toBe(2);
  });

  test("releases ownership after cleanup fails and leaves the disposed handle unusable", async () => {
    let cleanupAttempts = 0;
    const run: RunSubprocess = async (command) => {
      if (command.includes("state")) return success({ files: [] });
      if (command.at(-1) === "close") {
        cleanupAttempts += 1;
        return cleanupAttempts === 1 ? failure("close failed") : success(null);
      }
      return success(null);
    };
    const input = {
      namespace: `freee-web-close-retry-${process.pid}`,
      sessionPrefix: "retry",
      companyId: 987_655,
      authProfile: "business-freee",
      environment: encryptedEnvironment,
      run,
    } as const;

    const first = await createAgentBrowserSession(input);
    await expect(first.dispose()).rejects.toThrow("close failed");
    await expect(first.run(["open", "https://secure.freee.co.jp/"])).rejects.toThrow("disposed");

    const second = await createAgentBrowserSession(input);
    await second.dispose();
  });

  test("keeps the restored session ID short for a long Auth Profile name", async () => {
    const authProfile = "a".repeat(80);
    const run: RunSubprocess = async (command) =>
      command.includes("state") ? success({ files: [] }) : success(null);
    const browser = await createAgentBrowserSession({
      namespace: "freee-web",
      sessionPrefix: "fb",
      companyId: 2_021_254,
      authProfile,
      environment: encryptedEnvironment,
      run,
    });

    expect(browser.sessionId).toBe(expectedSessionId("fb", 2_021_254, authProfile));
    expect(new TextEncoder().encode(browser.sessionId)).toHaveLength(27);
    await browser.dispose();
  });

  test("rejects a plaintext restore state before opening the browser", async () => {
    const calls: string[][] = [];
    const responses = [
      success({
        files: [
          {
            filename: `${expectedSessionId("fb", 123, "business-freee")}-state.json`,
            encrypted: false,
          },
        ],
      }),
    ];
    const run: RunSubprocess = async (command) => {
      calls.push([...command]);
      const response = responses.shift();
      if (!response) throw new Error("unexpected subprocess call");
      return response;
    };

    await expect(
      createAgentBrowserSession({
        namespace: "freee-web-bookkeeping",
        sessionPrefix: "fb",
        companyId: 123,
        authProfile: "business-freee",
        environment: encryptedEnvironment,
        run,
      }),
    ).rejects.toThrow("unencrypted saved state");
    expect(calls.some((command) => command.includes("--restore"))).toBe(false);
  });

  test("explains how to install Agent Browser when the executable is unavailable", async () => {
    const run: RunSubprocess = async () => {
      throw new Error("Executable not found");
    };

    await expect(
      createAgentBrowserSession({
        namespace: "freee-web-bookkeeping",
        sessionPrefix: "fb",
        companyId: 123,
        authProfile: "business-freee",
        environment: encryptedEnvironment,
        run,
      }),
    ).rejects.toThrow("agent-browser --version");
  });
});
