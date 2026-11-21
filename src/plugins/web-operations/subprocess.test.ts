import { describe, expect, test } from "bun:test";

import { runSubprocess } from "./subprocess.ts";

describe("runSubprocess", () => {
  test("captures stdout, stderr, and the exit code concurrently", async () => {
    const result = await runSubprocess([
      "bun",
      "-e",
      'process.stdout.write("out"); process.stderr.write("err"); process.exitCode = 7;',
    ]);

    expect(result).toEqual({ exitCode: 7, timedOut: false, stdout: "out", stderr: "err" });
  });

  test("passes complex input through stdin instead of command interpolation", async () => {
    const input = '`quoted` $HOME "value"';
    const result = await runSubprocess(
      ["bun", "-e", "process.stdout.write(await Bun.stdin.text())"],
      { stdin: input },
    );

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe(input);
  });

  test("marks a timed out process", async () => {
    const result = await runSubprocess(["bun", "-e", "await Bun.sleep(1000)"], {
      timeoutMs: 10,
    });

    expect(result.timedOut).toBe(true);
    expect(result.exitCode).not.toBe(0);
  });

  test("force kills a timed out process that ignores SIGTERM", async () => {
    const startedAt = Date.now();
    const result = await runSubprocess(
      ["bun", "-e", 'process.on("SIGTERM", () => {}); await Bun.sleep(2000)'],
      { timeoutMs: 100 },
    );

    expect(result.timedOut).toBe(true);
    expect(result.exitCode).not.toBe(0);
    expect(Date.now() - startedAt).toBeLessThan(1000);
  });

  test("names an executable that cannot be started", async () => {
    await expect(runSubprocess(["freee-web-command-that-does-not-exist"])).rejects.toThrow(
      "freee-web-command-that-does-not-exist",
    );
  });
});
