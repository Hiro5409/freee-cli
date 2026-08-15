import { define } from "gunshi";
import colors from "yoctocolors";

import { globalArgs } from "../../global-args.ts";
import { parsePositiveId } from "../../helpers.ts";
import { formatValue } from "../../output/formatter.ts";
import { resolveConfiguredProfile } from "../../profiles.ts";

export const companySetDefaultCommand = define({
  name: "company-switch",
  description: "Set a profile's default company",
  args: {
    ...globalArgs,
    id: { type: "string" as const, description: "Company ID to use by default", required: true },
    name: { type: "string" as const, description: "Company display name" },
  },
  run: async (ctx) => {
    const { configDir, loadConfig, saveConfig } = await import("../../config/config.ts");
    const dir = configDir();
    const config = loadConfig(dir);
    const profile = resolveConfiguredProfile(ctx.values.profile, dir);
    const companyId = parsePositiveId(ctx.values.id, "--id");

    const selectedCompany = {
      companyId,
      name: ctx.values.name ?? String(companyId),
    };
    config.profiles[profile] = selectedCompany;

    saveConfig(dir, config);
    return formatValue(
      { profile, companyId, name: selectedCompany.name },
      ctx.values.format,
      colors.green(`Default company set to ${companyId} for profile "${profile}".`),
    );
  },
});
