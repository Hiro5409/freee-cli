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
  test("freee --help shows usage with subcommands", async () => {
    const { stdout } = await runCli(["--help"]);
    expect(stdout).toContain("freee");
    expect(stdout).toContain("login");
    expect(stdout).toContain("setup");
    expect(stdout).toContain("hr-employee-list");
    expect(stdout).toContain("hr-payroll-list");
    expect(stdout).toContain("docs");
    expect(stdout).toContain("freee setup");
    expect(stdout).toContain("freee docs list --format json");
    expect(stdout).toContain("--no-color");
    expect(stdout).not.toContain("--no-color                     color");
  });

  test("freee --version shows version", async () => {
    const { stdout } = await runCli(["--version"]);
    expect(stdout.trim()).toMatch(/^\d+\.\d+\.\d+$/);
  });

  test("freee login --help shows login usage", async () => {
    const { stdout } = await runCli(["login", "--help"]);
    expect(stdout).toContain("login");
    expect(stdout).toContain("coding agents should ask the user");
    expect(stdout).toContain("freee login --profile");
  });

  test("freee setup --help shows setup usage", async () => {
    const { stdout } = await runCli(["setup", "--help"]);
    expect(stdout).toContain("setup");
    expect(stdout).toContain("coding agents should ask the user");
  });

  test("freee logout --help shows logout usage", async () => {
    const { stdout } = await runCli(["logout", "--help"]);
    expect(stdout).toContain("logout");
  });

  test("freee status --help shows status usage", async () => {
    const { stdout } = await runCli(["status", "--help"]);
    expect(stdout).toContain("status");
  });

  test("read-only commands do not advertise --dry-run", async () => {
    const { stdout } = await runCli(["company-list", "--help"]);
    expect(stdout).not.toContain("--dry-run");
  });

  test("write commands advertise --dry-run", async () => {
    const { stdout } = await runCli(["deal-create", "--help"]);
    expect(stdout).toContain("--dry-run");
  });

  test("every write command help includes a dry-run JSON example", async () => {
    const commands = [
      "auto-rule-apply",
      "auto-rule-create",
      "auto-rule-delete",
      "auto-rule-disable",
      "auto-rule-enable",
      "deal-create",
      "deal-update",
      "invoice-create",
      "invoice-update",
      "receipt-attach",
      "receipt-upload",
    ];

    for (const command of commands) {
      const { stdout, stderr, exitCode } = await runCli([command, "--help"]);
      expect(exitCode, command).toBe(0);
      expect(stderr, command).toBe("");
      expect(stdout, command).toContain(`freee ${command}`);
      expect(stdout, command).toContain("--dry-run");
      expect(stdout, command).toContain("--format json");
    }
  });

  test("freee status --format json emits JSON error to stderr when credentials are missing", async () => {
    const { stdout, stderr, exitCode } = await runCliWithEmptyConfig([
      "status",
      "--format",
      "json",
    ]);

    expect(exitCode).toBe(2);
    expect(stdout).toBe("");
    const payload = JSON.parse(stderr);
    expect(payload.error).toContain("No credentials found");
    expect(payload.exitCode).toBe(2);
    expect(payload.why).toBe("Authentication credentials are missing or invalid.");
    expect(payload.hint).toContain("freee login --profile <name>");
    expect(payload.hint).toContain("retry with --profile <name>");
  });

  test("freee status keeps human error output by default", async () => {
    const { stdout, stderr, exitCode } = await runCliWithEmptyConfig(["status"]);

    expect(exitCode).toBe(2);
    expect(stdout).toBe("");
    expect(stderr).toContain("No credentials found");
    expect(stderr).toContain("Authentication credentials are missing or invalid.");
    expect(stderr).toContain('Ask the user to run "freee login --profile <name>"');
    expect(() => JSON.parse(stderr)).toThrow();
  });

  test("non-TTY human errors do not contain ANSI escapes", async () => {
    const { stderr } = await runCliWithEmptyConfig(["status"]);

    expect(stderr).not.toContain("\u001B[");
  });

  test("a command that returns its output prints it to stdout", async () => {
    const { stdout, exitCode } = await runCliWithEmptyConfig([
      "deal-create",
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
      "--dry-run",
    ]);

    expect(exitCode).toBe(0);
    expect(stdout).toContain("Dry run");
  });

  test("freee --help renders usage exactly once", async () => {
    const { stdout } = await runCliWithEmptyConfig(["--help"]);

    expect(stdout.split("USAGE:").length - 1).toBe(1);
  });

  test("freee --version prints the version exactly once", async () => {
    const { stdout } = await runCliWithEmptyConfig(["--version"]);

    expect(stdout.trim().split("\n")).toHaveLength(1);
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
      "deal-show",
      "--format",
      "json",
    ]);

    expect(exitCode).toBe(1);
    expect(stdout).toBe("");
    const payload = JSON.parse(stderr);
    expect(payload.error).toContain("Optional argument '--id' is required");
    expect(payload.exitCode).toBe(1);
    expect(payload.why).toContain("command interface");
    expect(payload.hint).toContain("freee deal-show --help");
    expect(stderr.match(/Optional argument '--id' is required/g)).toHaveLength(1);
    expect(stderr).not.toContain("TypeError");
    expect(stderr).not.toContain("Bun v");
  });

  test("unknown options fail before a write command can run", async () => {
    const { stdout, stderr, exitCode } = await runCliWithEmptyConfig([
      "deal-create",
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
      "company-list",
      "--format",
      "yaml",
    ]);

    expect(exitCode).toBe(1);
    expect(stdout).toBe("");
    expect(stderr).toMatch(/json|table/);
    expect(stderr).not.toContain("No credentials found");
  });

  test("docs list exposes the bundled topics as JSON", async () => {
    const { stdout, stderr, exitCode } = await runCli(["docs", "list", "--format", "json"]);

    expect(exitCode).toBe(0);
    expect(stderr).toBe("");
    const payload = JSON.parse(stdout);
    expect(payload.results.map(({ name }: { name: string }) => name)).toEqual([
      "authentication",
      "resource-boundaries",
      "safe-writes",
    ]);
    expect(payload.help).toContain("freee docs show <name>");
  });

  test("docs show returns a topic without authentication", async () => {
    const { stdout, stderr, exitCode } = await runCli(["docs", "show", "safe-writes"]);

    expect(exitCode).toBe(0);
    expect(stderr).toBe("");
    expect(stdout).toContain("# Safe writes");
    expect(stdout).toContain("--dry-run");
    expect(stdout).toContain("fetch-merge-PUT");
    expect(stdout).toContain("does not verify credentials");
  });

  test("docs show reports an actionable unknown-topic error", async () => {
    const { stdout, stderr, exitCode } = await runCli([
      "docs",
      "show",
      "missing",
      "--format",
      "json",
    ]);

    expect(exitCode).toBe(1);
    expect(stdout).toBe("");
    const payload = JSON.parse(stderr);
    expect(payload.error).toContain('Unknown documentation topic "missing"');
    expect(payload.why).toContain("bundled");
    expect(payload.hint).toContain("freee docs list --format json");
  });

  test("receipt upload dry-run honors JSON output", async () => {
    const { stdout, stderr, exitCode } = await runCliWithEmptyConfig([
      "receipt-upload",
      "--company-id",
      "123",
      "--file",
      "receipt.jpg",
      "--description",
      "test receipt",
      "--dry-run",
      "--format",
      "json",
    ]);

    expect(exitCode).toBe(0);
    expect(stderr).toBe("");
    expect(JSON.parse(stdout)).toMatchObject({
      dryRun: true,
      request: {
        method: "POST",
        path: "/api/1/receipts",
        body: { company_id: 123, file: "receipt.jpg", description: "test receipt" },
      },
    });
  });

  test("receipt attach dry-run honors JSON output", async () => {
    const { stdout, stderr, exitCode } = await runCliWithEmptyConfig([
      "receipt-attach",
      "--company-id",
      "123",
      "--deal-id",
      "42",
      "--file",
      "receipt.jpg",
      "--dry-run",
      "--format",
      "json",
    ]);

    expect(exitCode).toBe(0);
    expect(stderr).toBe("");
    const output = JSON.parse(stdout);
    expect(output.dryRun).toBe(true);
    expect(output.operations).toHaveLength(2);
    expect(output.operations[1].path).toBe("/api/1/deals/42");
  });
});
