import { configureClient } from "./api/client.ts";
import { parseCliInput, PositiveIntegerSchema } from "./cli-input.ts";
import { configDir, loadConfig } from "./config/config.ts";
import { CliError, errorHints } from "./errors.ts";
import { resolveConfiguredProfile, resolveConfiguredProfileName } from "./profiles.ts";

type CommandContext = { values: Record<string, unknown> };

export function initClient(ctx: CommandContext): { dir: string; profile: string } {
  const dir = configDir();
  const profile = ctx.values["dry-run"]
    ? resolveConfiguredProfileName(ctx.values.profile, dir)
    : resolveConfiguredProfile(ctx.values.profile, dir);
  configureClient(dir, profile);
  return { dir, profile };
}

export function initCommand(ctx: CommandContext): { companyId: number } {
  const { dir, profile } = initClient(ctx);

  let companyId = ctx.values["company-id"];
  if (!companyId) {
    const config = loadConfig(dir);
    companyId = config.profiles[profile]?.companyId;
  }
  if (!companyId) {
    throw new CliError('No company ID. Use --company-id or run "freee company switch" first.', {
      code: "INVALID_INPUT",
      why: "This command needs a target freee company.",
      hint: errorHints.company,
    });
  }

  return { companyId: parseCliInput(PositiveIntegerSchema, companyId, { label: "--company-id" }) };
}
