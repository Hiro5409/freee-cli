import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { saveCredentials } from "./config/credentials.ts";
import { CliError } from "./errors.ts";
import { initCommand, monthToDateRange } from "./helpers.ts";

const helperConfigDir = join(tmpdir(), `freee-cli-helpers-test-${Date.now()}`);
const originalConfigDir = process.env.FREEE_CLI_CONFIG_DIR;

beforeAll(() => {
  mkdirSync(helperConfigDir, { recursive: true });
  saveCredentials(helperConfigDir, {
    default: {
      clientId: "client",
      clientSecret: "secret",
      accessToken: "access",
      refreshToken: "refresh",
      expiresAt: Date.now() + 60_000,
    },
  });
  process.env.FREEE_CLI_CONFIG_DIR = helperConfigDir;
});

afterAll(() => {
  if (originalConfigDir === undefined) delete process.env.FREEE_CLI_CONFIG_DIR;
  else process.env.FREEE_CLI_CONFIG_DIR = originalConfigDir;
  rmSync(helperConfigDir, { recursive: true, force: true });
});

describe("monthToDateRange", () => {
  test("通常月 2026-03 → 01〜31", () => {
    expect(monthToDateRange({ year: 2026, month: 3 })).toEqual({
      start: "2026-03-01",
      end: "2026-03-31",
    });
  });

  test("うるう年 2024-02 → 01〜29", () => {
    expect(monthToDateRange({ year: 2024, month: 2 })).toEqual({
      start: "2024-02-01",
      end: "2024-02-29",
    });
  });

  test("非うるう年 2025-02 → 01〜28", () => {
    expect(monthToDateRange({ year: 2025, month: 2 })).toEqual({
      start: "2025-02-01",
      end: "2025-02-28",
    });
  });

  test("12月 2026-12 → 01〜31", () => {
    expect(monthToDateRange({ year: 2026, month: 12 })).toEqual({
      start: "2026-12-01",
      end: "2026-12-31",
    });
  });
});

describe("initCommand", () => {
  test("数値でない --company-id は NaN のまま通さない", () => {
    expect(() => initCommand({ values: { "company-id": "abc" } })).toThrow(CliError);
  });

  test("正の整数の --company-id は number で返す", () => {
    expect(initCommand({ values: { "company-id": "123" } }).companyId).toBe(123);
  });
});
