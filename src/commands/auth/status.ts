import { define } from "gunshi";

import { configureClient } from "../../api/client.ts";
import { configDir, loadConfig } from "../../config/config.ts";
import { CliError } from "../../errors.ts";
import { globalArgs } from "../../global-args.ts";
import { formatValue } from "../../output/formatter.ts";
import { freeeWebStatus } from "../../plugins/web-operations/freee-web.ts";
import { resolveConfiguredProfile } from "../../profiles.ts";
import { getCompanies } from "../../types/freee/sdk.gen.ts";

function failure(error: unknown, hint: string) {
  return {
    status:
      error instanceof CliError && error.code === "AUTHENTICATION"
        ? "login_required"
        : "unavailable",
    error: error instanceof Error ? error.message : "Authentication check failed.",
    hint,
  };
}

export const statusCommand = define({
  name: "status",
  description: "Check API access and browser authentication for the selected company",
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
      (error: unknown) => failure(error, `freee auth login --profile ${profile} --replace`),
    );
    const web =
      companyId === null
        ? {
            status: "not_configured",
            hint: `freee company switch --profile ${profile} --id <company-id>`,
          }
        : await freeeWebStatus({ profile, companyId }).catch((error: unknown) =>
            failure(error, `freee auth login --web --profile ${profile}`),
          );
    const result = { profile, companyId, api, web };
    return formatValue(
      result,
      ctx.values.format,
      `Profile: ${profile}\nCompany: ${companyId ?? "not configured"}\nAPI: ${api.status}\nWeb: ${web.status}${"hint" in web ? `\n${web.hint}` : ""}${"hint" in api ? `\n${api.hint}` : ""}`,
    );
  },
});
