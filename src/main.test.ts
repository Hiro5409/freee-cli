import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

type Result = { stdout: string; stderr: string; exitCode: number };

async function runCli(args: string[], env: Record<string, string> = {}): Promise<Result> {
  const proc = Bun.spawn(["bun", "src/main.ts", ...args], {
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env, ...env },
  });
  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  const exitCode = await proc.exited;
  return { stdout, stderr, exitCode };
}

async function runCliWithEmptyConfig(args: string[]): Promise<Result> {
  const dir = mkdtempSync(join(tmpdir(), "freee-cli-test-"));
  try {
    return await runCli(args, { FREEE_CLI_CONFIG_DIR: dir });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe("CLI integration", () => {
  test("freee --help shows usage with subcommands", async () => {
    const { stdout } = await runCli(["--help"]);
    expect(stdout.split("USAGE:").length - 1).toBe(1);
    expect(stdout).toContain("freee");
    expect(stdout).toContain("auth");
    expect(stdout).toContain("setup");
    expect(stdout).toContain("accounting");
    expect(stdout).toContain("invoice");
    expect(stdout).toContain("hr");
    expect(stdout).toContain("schema");
    expect(stdout).toContain("freee setup");
  });

  test("freee --version shows version", async () => {
    const { stdout } = await runCli(["--version"]);
    expect(stdout.trim().split("\n")).toHaveLength(1);
    expect(stdout.trim()).toMatch(/^\d+\.\d+\.\d+$/);
  });

  test("a command group without a subcommand reports a JSON error", async () => {
    for (const args of [[], ["accounting"], ["accounting", "deal"]]) {
      const { stdout, stderr, exitCode } = await runCliWithEmptyConfig(args);
      expect(exitCode).toBe(1);
      expect(stdout).toBe("");
      const payload = JSON.parse(stderr);
      expect(payload.code).toBe("INVALID_INPUT");
      expect(payload.error).toBe("A subcommand is required.");
      expect(payload.hint).toContain(["freee", ...args, "--help"].join(" "));
    }
  });

  test("freee auth login --help shows login usage", async () => {
    const { stdout } = await runCli(["auth", "login", "--help"]);
    expect(stdout).toContain("login");
    expect(stdout).toContain("--web");
    expect(stdout).toContain("freee auth login --profile");
  });

  test("a read without credentials emits a JSON error to stderr", async () => {
    const { stdout, stderr, exitCode } = await runCliWithEmptyConfig(["auth", "status"]);

    expect(exitCode).toBe(2);
    expect(stdout).toBe("");
    const payload = JSON.parse(stderr);
    expect(payload.code).toBe("AUTHENTICATION");
    expect(payload.error).toContain("No credentials found");
    expect(payload.exitCode).toBe(2);
    expect(payload.why).toBe("Authentication credentials are missing or invalid.");
    expect(payload.hint).toContain("freee auth login --profile <name>");
    expect(payload.hint).toContain("retry with --profile <name>");
  });

  test("a dry run prints its preview to stdout as one line of JSON", async () => {
    const { stdout, exitCode } = await runCliWithEmptyConfig([
      "accounting",
      "deal",
      "delete",
      "--company-id",
      "123",
      "--id",
      "42",
      "--dry-run",
    ]);

    expect(exitCode).toBe(0);
    expect(stdout).toBe(
      '{"dryRun":true,"request":{"method":"DELETE","url":"https://api.freee.co.jp/api/1/deals/42","query":{"company_id":123}}}\n',
    );
  });

  test("a stray argument stops the command without echoing it", async () => {
    const write = ["accounting", "deal", "delete", "--company-id", "1", "--id", "2"];
    for (const args of [
      [...write, "--dry-run", '{"token":"secret-value"}'],
      [...write, "--", "--dry-run"],
      [...write, "--dry-run", "--", "secret-value"],
    ]) {
      const { stdout, stderr, exitCode } = await runCliWithEmptyConfig(args);

      expect(exitCode).toBe(1);
      expect(stdout).toBe("");
      expect(JSON.parse(stderr).error).toBe("Unexpected positional argument (1).");
      expect(stderr).not.toContain("secret-value");
    }
  });

  test("a misspelled subcommand points to the group's help", async () => {
    const { stderr, exitCode } = await runCliWithEmptyConfig(["accounting", "deel", "list"]);

    expect(exitCode).toBe(1);
    expect(JSON.parse(stderr).hint).toContain('Run "freee accounting --help"');
  });

  test("an integer flag beyond 2^53 - 1 is rejected instead of rounded", async () => {
    const { stderr, exitCode } = await runCliWithEmptyConfig([
      "accounting",
      "deal",
      "show",
      "--company-id",
      "1",
      "--id",
      "9007199254740993",
      "--dry-run",
    ]);

    expect(exitCode).toBe(1);
    expect(JSON.parse(stderr).error).toContain("2^53 - 1");
  });

  test("unknown commands report one error without an internal stack trace", async () => {
    const { stderr, exitCode } = await runCliWithEmptyConfig(["no-such-command"]);

    expect(exitCode).toBe(1);
    expect(stderr.match(/Command not found: no-such-command/g)).toHaveLength(1);
    expect(stderr).not.toContain("TypeError");
    expect(stderr).not.toContain("Bun v");
  });

  test("missing required arguments report one error without an internal stack trace", async () => {
    const { stdout, stderr, exitCode } = await runCliWithEmptyConfig([
      "accounting",
      "deal",
      "show",
    ]);

    expect(exitCode).toBe(1);
    expect(stdout).toBe("");
    const payload = JSON.parse(stderr);
    expect(payload.error).toContain("Argument '--id' is required");
    expect(payload.exitCode).toBe(1);
    expect(payload.why).toContain("command interface");
    expect(payload.hint).toContain("freee accounting deal show --help");
    expect(stderr.match(/Argument '--id' is required/g)).toHaveLength(1);
    expect(stderr).not.toContain("TypeError");
    expect(stderr).not.toContain("Bun v");
  });

  test("unknown options fail before a write command can run", async () => {
    const { stdout, stderr, exitCode } = await runCliWithEmptyConfig([
      "accounting",
      "deal",
      "create",
      "--company-id",
      "123",
      "--body",
      "{}",
      "--dryrun",
    ]);

    expect(exitCode).toBe(1);
    expect(stdout).toBe("");
    const payload = JSON.parse(stderr);
    expect(payload.error).toContain("Unknown option: --dryrun");
    expect(stderr).not.toContain("No credentials found");
  });

  test("a request that breaks the API schema reports one validation issue", async () => {
    const { stdout, stderr, exitCode } = await runCliWithEmptyConfig([
      "accounting",
      "manual-journal",
      "create",
      "--company-id",
      "1",
      "--body",
      '{"issue_date":"2026-08-01","details":[{"entry_side":"left","tax_code":0,"amount":1}]}',
      "--dry-run",
    ]);

    expect(exitCode).toBe(1);
    expect(stdout).toBe("");
    const payload = JSON.parse(stderr);
    expect(payload.code).toBe("INVALID_INPUT");
    expect(payload.error).toContain("body.details.0.entry_side");
  });
});
