import * as v from "valibot";

import { configureClient } from "./api/client.ts";
import { PositiveIntegerSchema, PositiveIntegerTextSchema, parseCliInput } from "./cli-input.ts";
import { configDir, loadConfig } from "./config/config.ts";
import { CliError, errorHints } from "./errors.ts";
import { resolveConfiguredProfile, resolveConfiguredProfileName } from "./profiles.ts";

const CompanyIdSchema = v.union([PositiveIntegerTextSchema, PositiveIntegerSchema]);

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
  return {
    companyId: parseCliInput(CompanyIdSchema, companyId, { label: "--company-id" }),
    format,
  };
}

export function monthToDateRange({ year, month: monthNumber }: { year: number; month: number }): {
  start: string;
  end: string;
} {
  const paddedMonth = String(monthNumber).padStart(2, "0");
  const start = `${year}-${paddedMonth}-01`;
  const lastDay = new Date(year, monthNumber, 0).getDate();
  const end = `${year}-${paddedMonth}-${String(lastDay).padStart(2, "0")}`;
  return { start, end };
}
