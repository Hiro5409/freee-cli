import { define } from "gunshi";

import { configureClient } from "../../api/client.ts";
import { configDir } from "../../config/config.ts";
import { globalArgs } from "../../global-args.ts";
import { formatOutput } from "../../output/formatter.ts";
import { resolveConfiguredProfile } from "../../profiles.ts";
import { getCompanies } from "../../types/freee/sdk.gen.ts";

export const companyListCommand = define({
  name: "company-list",
  description: "List companies (workspaces)",
  args: globalArgs,
  run: async (ctx) => {
    const dir = configDir();
    const profile = resolveConfiguredProfile(ctx.values.profile, dir);
    configureClient(dir, profile);
    const format = ctx.values.format;

    const { data } = await getCompanies();
    return formatOutput(data.companies, format);
  },
});
