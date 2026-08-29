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
    expect(stdout.split("USAGE:").length - 1).toBe(1);
    expect(stdout).toContain("freee");
    expect(stdout).toContain("login");
    expect(stdout).toContain("setup");
    expect(stdout).toContain("hr-employee-list");
    expect(stdout).toContain("hr-payroll-list");
    expect(stdout).toContain("deal-payment-create");
    expect(stdout).toContain("invoice-show");
    expect(stdout).toContain("partner-show");
    expect(stdout).toContain("partner-create");
    expect(stdout).toContain("file-box-show");
    expect(stdout).toContain("walletable-list");
    expect(stdout).toContain("wallet-txn-list");
    expect(stdout).toContain("auto-rule-list");
    expect(stdout).toMatch(/^  bs <OPTIONS>/m);
    expect(stdout).toMatch(/^  pl <OPTIONS>/m);
    expect(stdout).toContain("invoice-restore");
    expect(stdout).toContain("company-switch");
    expect(stdout).toContain("journal-export");
    expect(stdout).toMatch(/^  web <OPTIONS>/m);
    expect(stdout).toContain("freee setup");
    expect(stdout).toContain("--no-color");
    expect(stdout).not.toContain("--no-color                     color");
  });

  test("freee --version shows version", async () => {
    const { stdout } = await runCli(["--version"]);
    expect(stdout.trim().split("\n")).toHaveLength(1);
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

  test("freee web --help describes experimental Web-only operations", async () => {
    const { stdout, stderr, exitCode } = await runCli(["web", "--help"]);
    expect(exitCode).toBe(0);
    expect(stderr).toBe("");
    expect(stdout).toContain("Experimental");
    expect(stdout).toMatch(/^  wallet-txn <OPTIONS>/m);
    expect(stdout).toMatch(/^  walletable <OPTIONS>/m);
  });

  test("freee Web write command help exposes examples and operation-specific options", async () => {
    const commands = [
      { path: ["wallet-txn", "apply-rules"], options: [] },
      { path: ["wallet-txn", "ignore"], options: [] },
      {
        path: ["wallet-txn", "register"],
        options: ["--account-item-name", "--tax-name", "--description"],
      },
      { path: ["wallet-txn", "restore"], options: [] },
      { path: ["wallet-txn", "settle"], options: ["--deal-id", "--amount"] },
      {
        path: ["wallet-txn", "transfer"],
        options: ["--counterparty-walletable-name", "--description"],
      },
      { path: ["invoice", "register-deal"], options: [] },
      { path: ["walletable", "sync"], options: ["--all", "--id"] },
    ];

    for (const { path, options } of commands) {
      const name = path.join(" ");
      const { stdout, stderr, exitCode } = await runCli(["web", ...path, "--help"]);
      expect(exitCode, name).toBe(0);
      expect(stderr, name).toBe("");
      expect(stdout, name).toContain(`freee web ${name}`);
      expect(stdout, name).toContain("--dry-run");
      expect(stdout, name).toContain("--format json");
      for (const option of options) expect(stdout, name).toContain(option);
    }
  });

  test("read-only commands do not advertise --dry-run", async () => {
    const { stdout } = await runCli(["company-list", "--help"]);
    expect(stdout).not.toContain("--dry-run");
  });

  test("deal update exposes exact replacement fields without bulk-edit shortcuts", async () => {
    const { stdout } = await runCli(["deal-update", "--help"]);
    expect(stdout).toContain("--detail");
    expect(stdout).toContain("--receipt-ids");
    expect(stdout).not.toContain("--account-item-id");
    expect(stdout).not.toContain("--tax-code");
    expect(stdout).not.toContain("--file-box-document-ids");
  });

  test("every write command help includes a dry-run JSON example", async () => {
    const commands = [
      "wallet-txn-create",
      "wallet-txn-delete",
      "auto-rule-create",
      "auto-rule-delete",
      "auto-rule-disable",
      "auto-rule-enable",
      "auto-rule-update",
      "deal-create",
      "deal-delete",
      "deal-payment-create",
      "deal-payment-delete",
      "deal-payment-update",
      "deal-update",
      "invoice-create",
      "invoice-cancel",
      "invoice-restore",
      "invoice-update",
      "partner-create",
      "transfer-create",
      "transfer-delete",
      "transfer-update",
      "file-box-delete",
      "file-box-update",
      "file-box-upload",
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
    expect(payload.code).toBe("AUTHENTICATION");
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
    expect(payload.error).toContain("Argument '--id' is required");
    expect(payload.exitCode).toBe(1);
    expect(payload.why).toContain("command interface");
    expect(payload.hint).toContain("freee deal-show --help");
    expect(stderr.match(/Argument '--id' is required/g)).toHaveLength(1);
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

  test("required enum errors do not describe the argument as optional", async () => {
    const { stdout, stderr, exitCode } = await runCliWithEmptyConfig([
      "wallet-txn-create",
      "--company-id",
      "1",
      "--date",
      "2026-08-01",
      "--entry-side",
      "bogus",
      "--amount",
      "100",
      "--walletable-id",
      "1",
      "--walletable-type",
      "wallet",
      "--dry-run",
      "--format",
      "json",
    ]);

    expect(exitCode).toBe(1);
    expect(stdout).toBe("");
    const payload = JSON.parse(stderr);
    expect(payload.error).toContain("Argument '--entry-side' must be one of");
    expect(payload.error).toContain("income");
    expect(payload.error).toContain("expense");
    expect(payload.error).not.toContain("Optional argument");
  });

  test("malformed CLI input reports one actionable validation issue", async () => {
    const { stdout, stderr, exitCode } = await runCliWithEmptyConfig([
      "invoice-create",
      "--company-id",
      "1",
      "--partner-id",
      "2",
      "--billing-date",
      "2026/08/01",
      "--line",
      '{"description":"x","quantity":1,"unit_price":"1","tax_rate":10}',
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
