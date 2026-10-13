import { afterEach, describe, expect, mock, test } from "bun:test";
import { chmodSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { loadConfig, saveConfig } from "../config/config.ts";
import { loadOAuthCredentials, saveOAuthCredentials } from "../config/oauth.ts";
import { CliError } from "../errors.ts";
import { runSetupWizard, type SetupPrompts } from "./setup.ts";

const testDir = join(tmpdir(), `freee-cli-setup-test-${Date.now()}`);

afterEach(() => {
  delete process.env.FREEE_CLIENT_ID;
  delete process.env.FREEE_CLIENT_SECRET;
  rmSync(testDir, { recursive: true, force: true });
});

type SpawnOptions = {
  env: Record<string, string | undefined>;
};

function createPrompts({
  confirms = [],
  passwords = [],
  texts = [],
}: {
  confirms?: unknown[];
  passwords?: unknown[];
  texts?: unknown[];
} = {}): SetupPrompts {
  return {
    cancel: mock(() => undefined),
    confirm: mock(async () => confirms.shift()),
    intro: mock(() => undefined),
    isCancel: (value) => typeof value === "symbol",
    note: mock(() => undefined),
    outro: mock(() => undefined),
    password: mock(async () => passwords.shift()),
    text: mock(async () => texts.shift()),
    warn: mock(() => undefined),
  };
}

describe("setup wizard", () => {
  test("requires an interactive terminal", async () => {
    await expect(runSetupWizard({ interactive: false })).rejects.toThrow("interactive terminal");
  });

  test("stores new OAuth credentials, logs in, and selects a company", async () => {
    const prompts = createPrompts({
      confirms: [true, false, false],
      passwords: ["client-secret"],
      texts: ["client-id", "work", "42"],
    });
    const notes: string[] = [];
    prompts.note = (message) => {
      notes.push(message);
    };
    const spawn = mock((_command: string[], _options: SpawnOptions) => ({
      exited: Promise.resolve(0),
    }));
    process.env.FREEE_CLIENT_ID = "stale-client-id";
    process.env.FREEE_CLIENT_SECRET = "stale-client-secret";

    await runSetupWizard({
      configDirectory: testDir,
      cwd: "/workspace",
      entrypoint: "/workspace/src/main.ts",
      interactive: true,
      openBrowser: () => true,
      prompts,
      runtime: "/usr/local/bin/bun",
      spawn,
    });

    expect(loadOAuthCredentials(testDir)).toEqual({
      clientId: "client-id",
      clientSecret: "client-secret",
    });
    expect(spawn.mock.calls.map(([command]) => command)).toEqual([
      [
        "/usr/local/bin/bun",
        "/workspace/src/main.ts",
        "login",
        "--profile",
        "work",
        "--set-default",
      ],
      ["/usr/local/bin/bun", "/workspace/src/main.ts", "company-list", "--profile", "work"],
      [
        "/usr/local/bin/bun",
        "/workspace/src/main.ts",
        "company-switch",
        "--profile",
        "work",
        "--id",
        "42",
      ],
    ]);
    for (const [, spawnOptions] of spawn.mock.calls) {
      expect(spawnOptions.env.FREEE_CLIENT_ID).toBeUndefined();
      expect(spawnOptions.env.FREEE_CLIENT_SECRET).toBeUndefined();
    }
    expect(notes.join("\n")).toContain("https://app.secure.freee.co.jp/developers");
  });

  test("reuses stored OAuth credentials and an authenticated profile", async () => {
    saveOAuthCredentials(testDir, { clientId: "stored-id", clientSecret: "stored-secret" });
    chmodSync(join(testDir, "oauth.env"), 0o644);
    const prompts = createPrompts({
      confirms: [true, true, true, false],
      texts: ["default", "7"],
    });
    const spawn = mock((_command: string[], _options: SpawnOptions) => ({
      exited: Promise.resolve(0),
    }));

    await runSetupWizard({
      configDirectory: testDir,
      entrypoint: "",
      interactive: true,
      openBrowser: () => true,
      prompts,
      runtime: "/usr/bin/freee",
      spawn,
    });

    expect(loadOAuthCredentials(testDir)).toEqual({
      clientId: "stored-id",
      clientSecret: "stored-secret",
    });
    expect(statSync(join(testDir, "oauth.env")).mode & 0o777).toBe(0o600);
    expect(spawn.mock.calls.map(([command]) => command)).toEqual([
      ["/usr/bin/freee", "profile-set-default", "--name", "default"],
      ["/usr/bin/freee", "company-list", "--profile", "default"],
      ["/usr/bin/freee", "company-switch", "--profile", "default", "--id", "7"],
    ]);
  });

  test("enables experimental Web operations for the selected profile", async () => {
    saveOAuthCredentials(testDir, { clientId: "stored-id", clientSecret: "stored-secret" });
    saveConfig(testDir, {
      activeProfile: "work",
      defaults: { format: "table" },
      profiles: { work: { companyId: 42, name: "Business" } },
    });
    const prompts = createPrompts({
      confirms: [true, true, true, true],
      texts: ["work", "42", "business-freee"],
    });
    const notes: string[] = [];
    prompts.note = (message) => notes.push(message);
    const spawn = mock(() => ({ exited: Promise.resolve(0) }));

    await runSetupWizard({
      configDirectory: testDir,
      entrypoint: "",
      interactive: true,
      openBrowser: () => true,
      prompts,
      runtime: "/usr/bin/freee",
      spawn,
    });

    expect(loadConfig(testDir).profiles.work?.experimental).toEqual({
      web: { authProfile: "business-freee" },
    });
    expect(notes.join("\n")).toContain("agent-browser auth save business-freee");
  });

  test("disables existing experimental Web operations when the profile opts out", async () => {
    saveOAuthCredentials(testDir, { clientId: "stored-id", clientSecret: "stored-secret" });
    saveConfig(testDir, {
      activeProfile: "work",
      defaults: { format: "table" },
      profiles: {
        work: {
          companyId: 42,
          name: "Business",
          experimental: { web: { authProfile: "business-freee" } },
        },
      },
    });
    const prompts = createPrompts({
      confirms: [true, true, true, false],
      texts: ["work", "42"],
    });
    const confirmationOptions: Array<{ initialValue?: boolean; message: string }> = [];
    const confirm = prompts.confirm.bind(prompts);
    prompts.confirm = async (options) => {
      confirmationOptions.push(options);
      return confirm(options);
    };
    const spawn = mock(() => ({ exited: Promise.resolve(0) }));

    await runSetupWizard({
      configDirectory: testDir,
      entrypoint: "",
      interactive: true,
      openBrowser: () => true,
      prompts,
      runtime: "/usr/bin/freee",
      spawn,
    });

    expect(confirmationOptions[3]).toMatchObject({ initialValue: true });
    expect(loadConfig(testDir).profiles.work?.experimental).toBeUndefined();
  });

  test("stops cleanly when the user cancels a prompt", async () => {
    const prompts = createPrompts({ confirms: [Symbol("cancel")] });

    await expect(
      runSetupWizard({ interactive: true, openBrowser: () => true, prompts }),
    ).resolves.toBeUndefined();
    expect(loadOAuthCredentials(testDir)).toBeUndefined();
  });

  test("reports a failed CLI step", async () => {
    const prompts = createPrompts({
      confirms: [true, false],
      passwords: ["client-secret"],
      texts: ["client-id", "default", "1"],
    });
    const spawn = mock((_command: string[], _options: SpawnOptions) => ({
      exited: Promise.resolve(7),
    }));

    await expect(
      runSetupWizard({
        configDirectory: testDir,
        entrypoint: "",
        interactive: true,
        openBrowser: () => true,
        prompts,
        runtime: "/usr/bin/freee",
        spawn,
      }),
    ).rejects.toBeInstanceOf(CliError);
  });
});
