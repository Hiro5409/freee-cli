import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { saveCredentials } from "./config/credentials.ts";
import { CliError } from "./errors.ts";
import {
  initCommand,
  monthToDateRange,
  parseChoice,
  parseDate,
  parseInteger,
  parseNonNegativeInteger,
  parseNumber,
  parsePositiveId,
  stripDealReadOnly,
} from "./helpers.ts";

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
    expect(monthToDateRange("2026-03")).toEqual({ start: "2026-03-01", end: "2026-03-31" });
  });

  test("うるう年 2024-02 → 01〜29", () => {
    expect(monthToDateRange("2024-02")).toEqual({ start: "2024-02-01", end: "2024-02-29" });
  });

  test("非うるう年 2025-02 → 01〜28", () => {
    expect(monthToDateRange("2025-02")).toEqual({ start: "2025-02-01", end: "2025-02-28" });
  });

  test("12月 2026-12 → 01〜31", () => {
    expect(monthToDateRange("2026-12")).toEqual({ start: "2026-12-01", end: "2026-12-31" });
  });
});

describe("parseNumber", () => {
  test("正常な数値文字列 → number", () => {
    expect(parseNumber("100", "amount")).toBe(100);
  });

  test("NaN → CliError を throw", () => {
    expect(() => parseNumber("abc", "amount")).toThrow(CliError);
  });

  test("小数 → そのまま返す", () => {
    expect(parseNumber("1.5", "rate")).toBe(1.5);
  });
});

describe("stripDealReadOnly", () => {
  test("read-only フィールドを除去する", () => {
    const input = {
      issue_date: "2026-01-01",
      status: "settled",
      amount: 1000,
      partner_id: 42,
      payments: [],
      receipts: [],
    };
    const result = stripDealReadOnly(input);
    expect(result).toEqual({ issue_date: "2026-01-01", partner_id: 42 });
  });

  test("read-only フィールドがなければそのまま返す", () => {
    const input = { issue_date: "2026-01-01", partner_id: 42 };
    expect(stripDealReadOnly(input)).toEqual(input);
  });
});

describe("parseChoice", () => {
  const statuses = ["sent", "unsent"] as const;

  test("許された値はそのまま返す", () => {
    expect(parseChoice("unsent", statuses, "--sending-status")).toBe("unsent");
  });

  test("許されない値は CliError", () => {
    expect(() => parseChoice("draft", statuses, "--sending-status")).toThrow(CliError);
  });

  test("エラーメッセージに選択肢を並べる", () => {
    expect(() => parseChoice("draft", statuses, "--sending-status")).toThrow(/sent, unsent/);
  });
});

describe("parseDate", () => {
  test("YYYY-MM-DD はそのまま返す", () => {
    expect(parseDate("2026-08-01", "--billing-date")).toBe("2026-08-01");
  });

  test("区切りや桁が違えば CliError", () => {
    expect(() => parseDate("2026/08/01", "--billing-date")).toThrow(CliError);
    expect(() => parseDate("2026-8-1", "--billing-date")).toThrow(CliError);
  });

  test("暦にない日付は CliError", () => {
    expect(() => parseDate("2026-02-30", "--billing-date")).toThrow(CliError);
    expect(() => parseDate("2026-13-01", "--billing-date")).toThrow(CliError);
  });

  test("うるう日は通す", () => {
    expect(parseDate("2024-02-29", "--billing-date")).toBe("2024-02-29");
  });
});

describe("parsePositiveId", () => {
  test("正の整数を number にする", () => {
    expect(parsePositiveId("42", "--partner-id")).toBe(42);
  });

  test("0 や負数は CliError", () => {
    expect(() => parsePositiveId("0", "--partner-id")).toThrow(CliError);
    expect(() => parsePositiveId("-1", "--partner-id")).toThrow(CliError);
  });

  test("小数や数値でない値は CliError", () => {
    expect(() => parsePositiveId("1.5", "--partner-id")).toThrow(CliError);
    expect(() => parsePositiveId("abc", "--partner-id")).toThrow(CliError);
  });
});

describe("parseInteger", () => {
  test("正・負・ゼロの整数を number にする", () => {
    expect(parseInteger("5000", "--amount")).toBe(5000);
    expect(parseInteger("-5000", "--amount")).toBe(-5000);
    expect(parseInteger("0", "--balance")).toBe(0);
  });

  test("小数や数値でない値は CliError", () => {
    expect(() => parseInteger("1.5", "--amount")).toThrow(CliError);
    expect(() => parseInteger("abc", "--amount")).toThrow(CliError);
  });
});

describe("parseNonNegativeInteger", () => {
  test("accepts zero and positive integers", () => {
    expect(parseNonNegativeInteger("0", "--tax-code")).toBe(0);
    expect(parseNonNegativeInteger("21", "--tax-code")).toBe(21);
  });

  test("rejects negative and fractional values", () => {
    expect(() => parseNonNegativeInteger("-1", "--tax-code")).toThrow(CliError);
    expect(() => parseNonNegativeInteger("1.5", "--tax-code")).toThrow(CliError);
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
