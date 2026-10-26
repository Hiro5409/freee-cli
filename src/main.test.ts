import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

async function runCli(
  args: string[],
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const proc = Bun.spawn(["bun", "src/main.ts", ...args], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  const exitCode = await proc.exited;
  return { stdout, stderr, exitCode };
}

async function runCliWithEnv(
  args: string[],
  env: Record<string, string>,
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
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

async function runCliWithEmptyConfig(
  args: string[],
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const dir = mkdtempSync(join(tmpdir(), "freee-cli-test-"));
  try {
    return await runCliWithEnv(args, {
      FREEE_CLI_CONFIG_DIR: dir,
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe("CLI integration", () => {
  test("resources expose API and browser operations under the same command group", async () => {
    for (const args of [
      ["deal", "list"],
      ["wallet-txn", "list"],
      ["wallet-txn", "ignore"],
      ["invoice", "register-deal"],
    ]) {
      const result = await runCli([...args, "--help"]);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("--profile");
    }
  });
  test("freee --help shows usage with subcommands", async () => {
    const { stdout } = await runCli(["--help"]);
    expect(stdout.split("USAGE:").length - 1).toBe(1);
    expect(stdout).toContain("freee");
    expect(stdout).toContain("auth");
    expect(stdout).toContain("setup");
    expect(stdout).toContain("quotation");
    expect(stdout).toContain("freee setup");
    expect(stdout).toContain("--no-color");
  });

  test("freee --version shows version", async () => {
    const { stdout } = await runCli(["--version"]);
    expect(stdout.trim().split("\n")).toHaveLength(1);
    expect(stdout.trim()).toMatch(/^\d+\.\d+\.\d+$/);
  });

  test("freee auth login --help shows login usage", async () => {
    const { stdout } = await runCli(["auth", "login", "--help"]);
    expect(stdout).toContain("login");
    expect(stdout).toContain("--web");
    expect(stdout).toContain("freee auth login --profile");
  });

  test("freee auth status --format json emits JSON error to stderr when credentials are missing", async () => {
    const { stdout, stderr, exitCode } = await runCliWithEmptyConfig([
      "auth",
      "status",
      "--format",
      "json",
    ]);

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

  test("freee auth status keeps human error output by default", async () => {
    const { stdout, stderr, exitCode } = await runCliWithEmptyConfig(["auth", "status"]);

    expect(exitCode).toBe(2);
    expect(stdout).toBe("");
    expect(stderr).toContain("No credentials found");
    expect(stderr).toContain("Authentication credentials are missing or invalid.");
    expect(stderr).toContain('Run "freee auth login --profile <name>"');
    expect(() => JSON.parse(stderr)).toThrow();
    expect(stderr).not.toContain("\u001B[");
  });

  test("a command that returns its output prints it to stdout", async () => {
    const { stdout, exitCode } = await runCliWithEmptyConfig([
      "deal",
      "delete",
      "--company-id",
      "123",
      "--id",
      "42",
      "--dry-run",
    ]);

    expect(exitCode).toBe(0);
    expect(stdout).toContain("Dry run");
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
      "deal",
      "show",
      "--format",
      "json",
    ]);

    expect(exitCode).toBe(1);
    expect(stdout).toBe("");
    const payload = JSON.parse(stderr);
    expect(payload.error).toContain("Argument '--id' is required");
    expect(payload.exitCode).toBe(1);
    expect(payload.why).toContain("command interface");
    expect(payload.hint).toContain("freee deal show --help");
    expect(stderr.match(/Argument '--id' is required/g)).toHaveLength(1);
    expect(stderr).not.toContain("TypeError");
    expect(stderr).not.toContain("Bun v");
  });

  test("unknown options fail before a write command can run", async () => {
    const { stdout, stderr, exitCode } = await runCliWithEmptyConfig([
      "deal",
      "create",
      "--company-id",
      "123",
      "--date",
      "2026-03-15",
      "--type",
      "expense",
      "--account-item-id",
      "101",
      "--tax-code",
      "21",
      "--amount",
      "10000",
      "--dryrun",
      "--format",
      "json",
    ]);

    expect(exitCode).toBe(1);
    expect(stdout).toBe("");
    const payload = JSON.parse(stderr);
    expect(payload.error).toContain("Unknown option: --dryrun");
    expect(stderr).not.toContain("No credentials found");
  });

  test("unsupported output formats fail validation", async () => {
    const { stdout, stderr, exitCode } = await runCliWithEmptyConfig([
      "company",
      "list",
      "--format",
      "yaml",
    ]);

    expect(exitCode).toBe(1);
    expect(stdout).toBe("");
    expect(stderr).toMatch(/json|table/);
    expect(stderr).not.toContain("No credentials found");
  });

  test("malformed CLI input reports one actionable validation issue", async () => {
    const { stdout, stderr, exitCode } = await runCliWithEmptyConfig([
      "invoice",
      "update",
      "--company-id",
      "1",
      "--id",
      "2",
      "--billing-date",
      "2026/08/01",
      "--dry-run",
      "--format",
      "json",
    ]);

    expect(exitCode).toBe(1);
    expect(stdout).toBe("");
    const payload = JSON.parse(stderr);
    expect(payload.error).toContain("--billing-date is invalid");
    expect(payload.error.match(/Expected a real date in YYYY-MM-DD format\./g)).toHaveLength(1);
  });
});
