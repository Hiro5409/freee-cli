import { define } from "gunshi";
import colors from "yoctocolors";

import { configDir, loadConfig } from "../../config/config.ts";
import { updateCredentials } from "../../config/credentials.ts";
import { globalArgs } from "../../global-args.ts";
import { formatValue } from "../../output/formatter.ts";
import { logoutFreeeWeb } from "../../plugins/web-operations/freee-web.ts";
import { resolveConfiguredProfile } from "../../profiles.ts";

export const logoutCommand = define({
  name: "logout",
  description: "Remove stored API credentials and browser authentication for a profile",
  args: globalArgs,
  run: async (ctx) => {
    const dir = configDir();
    const profile = resolveConfiguredProfile(ctx.values.profile, dir);
    const companyId = loadConfig(dir).profiles[profile]?.companyId;
    if (companyId !== undefined) await logoutFreeeWeb({ profile, companyId });
    await updateCredentials(dir, (credentials) => {
      delete credentials[profile];
    });
    return formatValue(
      { profile, loggedOut: true },
      ctx.values.format,
      colors.green(`Logged out from profile "${profile}".`),
    );
  },
});
