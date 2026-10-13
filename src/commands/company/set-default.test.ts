import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { cli } from "gunshi";

import { MOCK_TOKEN } from "../../../test/credentials.ts";
import { loadConfig, saveConfig } from "../../config/config.ts";
import { saveCredentials } from "../../config/credentials.ts";
import { companySetDefaultCommand } from "./set-default.ts";

const testDir = join(tmpdir(), `freee-cli-company-set-default-test-${Date.now()}`);

beforeEach(() => {
  mkdirSync(testDir, { recursive: true });
  saveCredentials(testDir, { default: MOCK_TOKEN });
  process.env.FREEE_CLI_CONFIG_DIR = testDir;
});

afterEach(() => {
  delete process.env.FREEE_CLI_CONFIG_DIR;
  rmSync(testDir, { recursive: true, force: true });
});

describe("company set-default command", () => {
  test("rejects invalid company IDs without saving config", async () => {
    for (const id of ["abc", "0", "9007199254740992"]) {
      await expect(cli(["--id", id], companySetDefaultCommand)).rejects.toThrow();
      expect(existsSync(join(testDir, "config.json"))).toBe(false);
    }
  });

  test("switches company while preserving the profile's Web authentication", async () => {
    const experimental = { web: { authProfile: "test-freee" } };
    saveConfig(testDir, {
      activeProfile: "default",
      defaults: { format: "json" },
      profiles: { default: { companyId: 1, name: "First company", experimental } },
    });

    await cli(["--id", "2", "--format", "json"], companySetDefaultCommand);

    expect(loadConfig(testDir).profiles.default).toEqual({ companyId: 2, name: "2", experimental });
  });

  test("stores and returns a numeric company ID", async () => {
    const result = await cli(["--id", "007", "--format", "json"], companySetDefaultCommand);

    if (typeof result !== "string") throw new Error("expected string result");
    expect(JSON.parse(result)).toEqual({ profile: "default", companyId: 7, name: "7" });

    const config = JSON.parse(readFileSync(join(testDir, "config.json"), "utf-8"));
    expect(config.profiles.default.companyId).toBe(7);
  });
});
