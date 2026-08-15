import { define } from "gunshi";
import colors from "yoctocolors";

import { getTokenStatus } from "../../api/auth.ts";
import { configDir } from "../../config/config.ts";
import { loadCredentials } from "../../config/credentials.ts";
import { AuthError } from "../../errors.ts";
import { globalArgs } from "../../global-args.ts";
import { resolveConfiguredProfile } from "../../profiles.ts";

export const statusCommand = define({
  name: "status",
  description: "Show authentication status for a profile",
  args: globalArgs,
  run: (ctx) => {
    const format = ctx.values.format;
    const dir = configDir();
    const profile = resolveConfiguredProfile(ctx.values.profile, dir);
    const creds = loadCredentials(dir);
    const tokenSet = creds[profile];

    if (!tokenSet) {
      throw new AuthError(
        `No credentials found for profile "${profile}". Run "freee login" first.`,
      );
    }

    const status = getTokenStatus(tokenSet);
    if (format === "json") {
      return JSON.stringify(
        {
          profile,
          valid: status.isValid,
          expiresAt: status.expiresAt.toISOString(),
        },
        null,
        2,
      );
    }

    return [
      `Profile: ${profile}`,
      `Status: ${status.isValid ? colors.green("Valid") : colors.red("Expired")}`,
      `Expires: ${status.expiresAt.toISOString()}`,
    ].join("\n");
  },
});
