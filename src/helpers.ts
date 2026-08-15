import { configureClient } from "./api/client.ts";
import { configDir, loadConfig } from "./config/config.ts";
import { CliError, errorHints } from "./errors.ts";
import { resolveConfiguredProfile, resolveConfiguredProfileName } from "./profiles.ts";

export function initCommand(ctx: { values: Record<string, unknown> }): {
  companyId: number;
  format: string;
} {
  const dir = configDir();
  const profile = ctx.values["dry-run"]
    ? resolveConfiguredProfileName(ctx.values.profile, dir)
    : resolveConfiguredProfile(ctx.values.profile, dir);
  configureClient(dir, profile);

  let companyId = ctx.values["company-id"];
  if (!companyId) {
    const config = loadConfig(dir);
    companyId = config.profiles[profile]?.companyId;
  }
  if (!companyId) {
    throw new CliError('No company ID. Use --company-id or run "freee company-switch" first.', {
      code: "INVALID_INPUT",
      why: "This command needs a target freee company.",
      hint: errorHints.company,
    });
  }

  const format = String(ctx.values.format ?? "table");
  return { companyId: parsePositiveId(companyId, "--company-id"), format };
}

export function parseChoice<T extends string>(
  value: unknown,
  allowed: readonly T[],
  name: string,
): T {
  const choice = allowed.find((candidate) => candidate === value);
  if (choice !== undefined) return choice;
  throw new CliError(`${name} must be one of ${allowed.join(", ")}, got "${value}"`, {
    code: "INVALID_INPUT",
    why: "freee only accepts a fixed set of values for this field.",
    hint: errorHints.invalidValue,
  });
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const ISO_MONTH = /^(\d{4})-(\d{2})$/;

export function parseMonth(value: unknown, name: string): { year: number; month: number } {
  const text = String(value);
  const match = ISO_MONTH.exec(text);
  const month = Number(match?.[2]);
  if (!match || month < 1 || month > 12) {
    throw new CliError(`${name} must be a month in YYYY-MM, got "${value}"`, {
      code: "INVALID_INPUT",
      why: "freee expects a valid, zero-padded payroll month.",
      hint: errorHints.invalidValue,
    });
  }

  return { year: Number(match[1]), month };
}

export function parseYear(value: unknown, name: string): number {
  const text = String(value);
  if (!/^\d{4}$/.test(text)) {
    throw new CliError(`${name} must be a four-digit year, got "${value}"`, {
      code: "INVALID_INPUT",
      why: "freee expects a four-digit fiscal or calendar year.",
      hint: errorHints.invalidValue,
    });
  }
  return Number(text);
}

export function parseDate(value: unknown, name: string): string {
  const text = String(value);
  const invalid = new CliError(`${name} must be a real date in YYYY-MM-DD, got "${value}"`, {
    code: "INVALID_INPUT",
    why: "freee rejects dates that are not zero-padded YYYY-MM-DD calendar dates.",
    hint: errorHints.invalidValue,
  });

  if (!ISO_DATE.test(text)) throw invalid;

  // `new Date` rolls 2026-02-30 over to March, so compare the round-trip.
  const parsed = new Date(`${text}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== text) throw invalid;

  return text;
}

export function parsePositiveId(value: unknown, name: string): number {
  const n = parseStrictInteger(value);
  if (n === undefined || n < 1) {
    throw new CliError(`${name} must be a positive integer ID, got "${value}"`, {
      code: "INVALID_INPUT",
      why: "freee IDs are positive integers.",
      hint: errorHints.positiveId,
    });
  }
  return n;
}

export function parseInteger(value: unknown, name: string): number {
  const n = parseStrictInteger(value);
  if (n === undefined) {
    throw new CliError(`${name} must be an integer, got "${value}"`, {
      code: "INVALID_INPUT",
      why: "freee expects a whole-yen integer for this field.",
      hint: errorHints.invalidValue,
    });
  }
  return n;
}

export function parseNonNegativeInteger(value: unknown, name: string): number {
  const n = parseStrictInteger(value);
  if (n === undefined || n < 0) {
    throw new CliError(`${name} must be a non-negative integer, got "${value}"`, {
      code: "INVALID_INPUT",
      why: "freee expects a non-negative integer for this field.",
      hint: errorHints.invalidValue,
    });
  }
  return n;
}

export function parseLimit(value: unknown): number | undefined {
  if (value === undefined) return undefined;
  const limit = parseStrictInteger(value);
  if (limit === undefined || limit < 1) {
    throw new CliError(`--limit must be a positive integer, got "${value}"`, {
      code: "INVALID_INPUT",
      why: "A result limit must include at least one item.",
      hint: errorHints.invalidValue,
    });
  }
  return limit;
}

function parseStrictInteger(value: unknown): number | undefined {
  if (typeof value === "number") return Number.isSafeInteger(value) ? value : undefined;
  if (typeof value !== "string" || !/^-?\d+$/.test(value)) return undefined;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : undefined;
}

export function monthToDateRange(month: string): { start: string; end: string } {
  const { year, month: monthNumber } = parseMonth(month, "--month");
  const paddedMonth = String(monthNumber).padStart(2, "0");
  const start = `${year}-${paddedMonth}-01`;
  const lastDay = new Date(year, monthNumber, 0).getDate();
  const end = `${year}-${paddedMonth}-${String(lastDay).padStart(2, "0")}`;
  return { start, end };
}
