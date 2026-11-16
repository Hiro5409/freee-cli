import { define } from "gunshi";

import { configureClient } from "../../api/client.ts";
import { configDir } from "../../config/config.ts";
import { globalArgs } from "../../global-args.ts";
import { resolveConfiguredProfile } from "../../profiles.ts";
import { getCompanies } from "../../types/freee/sdk.gen.ts";

export const companyListCommand = define({
  name: "list",
  description: "List accessible freee companies",
  args: globalArgs,
  run: async (ctx) => {
    const dir = configDir();
    const profile = resolveConfiguredProfile(ctx.values.profile, dir);
    configureClient(dir, profile);

    const { data } = await getCompanies();
    return JSON.stringify(data.companies);
  },
});
