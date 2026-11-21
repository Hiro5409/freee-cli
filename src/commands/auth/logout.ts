import { define } from "gunshi";

import { configDir, loadConfig } from "../../config/config.ts";
import { updateCredentials } from "../../config/credentials.ts";
import { globalArgs } from "../../global-args.ts";
import { logoutFreeeWeb } from "../../plugins/web-operations/freee-web.ts";
import { resolveConfiguredProfile } from "../../profiles.ts";

export const logoutCommand = define({
  name: "logout",
  description: "Remove stored API credentials and browser authentication for a profile",
  args: globalArgs,
  run: async (ctx) => {
    const dir = configDir();
    const profile = resolveConfiguredProfile(ctx.values.profile, dir);
    await updateCredentials(dir, (credentials) => {
      delete credentials[profile];
    });
    const companyId = loadConfig(dir).profiles[profile]?.companyId;
    const browserSession =
      companyId === undefined
        ? "none"
        : await logoutFreeeWeb({ profile, companyId }).then(
            () => "removed",
            (error: unknown) => (error instanceof Error ? error.message : "cleanup failed"),
          );
    return JSON.stringify({ profile, loggedOut: true, browserSession });
  },
});
