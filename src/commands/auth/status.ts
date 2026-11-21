import { define } from "gunshi";

import { configureClient } from "../../api/client.ts";
import { configDir, loadConfig } from "../../config/config.ts";
import { CliError } from "../../errors.ts";
import { globalArgs } from "../../global-args.ts";
import { resolveConfiguredProfile } from "../../profiles.ts";
import { getCompanies } from "../../types/freee/sdk.gen.ts";

export const statusCommand = define({
  name: "status",
  description: "Check API access for the selected company",
  args: globalArgs,
  run: async (ctx) => {
    const dir = configDir();
    const profile = resolveConfiguredProfile(ctx.values.profile, dir);
    const companyId = loadConfig(dir).profiles[profile]?.companyId ?? null;
    configureClient(dir, profile);
    const api = await getCompanies().then(
      ({ data }) => ({
        status:
          companyId === null || data.companies.some((company) => company.id === companyId)
            ? "ready"
            : "company_mismatch",
      }),
      (error: unknown) => ({
        status:
          error instanceof CliError && error.code === "AUTHENTICATION"
            ? "login_required"
            : "unavailable",
        error: error instanceof Error ? error.message : "Authentication check failed.",
        hint: `freee auth login --profile ${profile} --replace`,
      }),
    );
    return JSON.stringify({ profile, companyId, api });
  },
});
