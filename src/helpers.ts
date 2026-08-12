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
      why: "This command needs a target freee company.",
      hint: errorHints.company,
    });
  }

  const format = String(ctx.values.format ?? "table");
  return { companyId: parsePositiveId(companyId, "--company-id"), format };
}

export function parseNumber(value: unknown, name: string): number {
  const n = Number(value);
  if (Number.isNaN(n)) {
    throw new CliError(`${name} must be a number, got "${value}"`, {
      why: "The supplied ID-like value could not be parsed as a number.",
      hint: errorHints.positiveId,
    });
  }
  return n;
}

export function parseChoice<T extends string>(
  value: unknown,
  allowed: readonly T[],
  name: string,
): T {
  const choice = allowed.find((candidate) => candidate === value);
  if (choice !== undefined) return choice;
  throw new CliError(`${name} must be one of ${allowed.join(", ")}, got "${value}"`, {
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
      why: "freee expects a valid, zero-padded payroll month.",
      hint: errorHints.invalidValue,
    });
  }

  return { year: Number(match[1]), month };
}

export function parseDate(value: unknown, name: string): string {
  const text = String(value);
  const invalid = new CliError(`${name} must be a real date in YYYY-MM-DD, got "${value}"`, {
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
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1) {
    throw new CliError(`${name} must be a positive integer ID, got "${value}"`, {
      why: "freee IDs are positive integers.",
      hint: errorHints.positiveId,
    });
  }
  return n;
}

export function parseInteger(value: unknown, name: string): number {
  const n = Number(value);
  if (!Number.isInteger(n)) {
    throw new CliError(`${name} must be an integer, got "${value}"`, {
      why: "freee expects a whole-yen integer for this field.",
      hint: errorHints.invalidValue,
    });
  }
  return n;
}

export function parseNonNegativeInteger(value: unknown, name: string): number {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0) {
    throw new CliError(`${name} must be a non-negative integer, got "${value}"`, {
      why: "freee expects a non-negative integer for this field.",
      hint: errorHints.invalidValue,
    });
  }
  return n;
}

function stripReadOnlyFields(
  obj: Record<string, unknown>,
  readOnlyKeys: string[],
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (!readOnlyKeys.includes(k)) result[k] = v;
  }
  return result;
}

const DEAL_READ_ONLY = [
  "status",
  "amount",
  "due_amount",
  "partner_code",
  "deal_origin_name",
  "payments",
  "receipts",
  "renews",
];

export function stripDealReadOnly(obj: Record<string, unknown>): Record<string, unknown> {
  return stripReadOnlyFields(obj, DEAL_READ_ONLY);
}

export function monthToDateRange(month: string): { start: string; end: string } {
  const [y, m] = month.split("-");
  const start = `${y}-${m}-01`;
  const lastDay = new Date(Number(y), Number(m), 0).getDate();
  const end = `${y}-${m}-${String(lastDay).padStart(2, "0")}`;
  return { start, end };
}
