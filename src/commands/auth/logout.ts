import { define } from "gunshi";
import colors from "yoctocolors";

import { configDir } from "../../config/config.ts";
import { updateCredentials } from "../../config/credentials.ts";
import { globalArgs } from "../../global-args.ts";
import { resolveConfiguredProfile } from "../../profiles.ts";

export const logoutCommand = define({
  name: "logout",
  description: "Remove stored OAuth tokens for a profile",
  args: globalArgs,
  run: async (ctx) => {
    const dir = configDir();
    const profile = resolveConfiguredProfile(ctx.values.profile, dir);
    await updateCredentials(dir, (credentials) => {
      delete credentials[profile];
    });
    return colors.green(`Logged out from profile "${profile}".`);
  },
});
