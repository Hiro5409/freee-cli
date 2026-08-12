import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { cli } from "gunshi";

import { companySwitchCommand } from "../../src/commands/company/switch.ts";
import { saveCredentials } from "../../src/config/credentials.ts";
import { MOCK_TOKEN } from "../fixtures.ts";

const testDir = join(tmpdir(), `freee-cli-company-switch-test-${Date.now()}`);

beforeEach(() => {
  mkdirSync(testDir, { recursive: true });
  saveCredentials(testDir, { default: MOCK_TOKEN });
  process.env.FREEE_CLI_CONFIG_DIR = testDir;
});

afterEach(() => {
  delete process.env.FREEE_CLI_CONFIG_DIR;
  rmSync(testDir, { recursive: true, force: true });
});

describe("company switch command", () => {
  test("rejects invalid company IDs without saving config", async () => {
    for (const id of ["abc", "0"]) {
      await expect(cli(["--id", id], companySwitchCommand)).rejects.toThrow(
        "--id must be a positive integer ID",
      );
      expect(existsSync(join(testDir, "config.json"))).toBe(false);
    }
  });

  test("stores and returns a numeric company ID", async () => {
    const result = await cli(["--id", "007", "--format", "json"], companySwitchCommand);

    if (typeof result !== "string") throw new Error("expected string result");
    expect(JSON.parse(result)).toEqual({ profile: "default", companyId: 7, name: "7" });

    const config = JSON.parse(readFileSync(join(testDir, "config.json"), "utf-8"));
    expect(config.profiles.default.companyId).toBe(7);
  });
});
