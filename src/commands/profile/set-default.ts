import { define } from "gunshi";
import colors from "yoctocolors";

import { globalArgs } from "../../global-args.ts";
import { setDefaultProfile } from "../../profiles.ts";

export const profileSetDefaultCommand = define({
  name: "profile-set-default",
  description: "Set the profile used when no override is provided",
  args: {
    ...globalArgs,
    name: { type: "string" as const, description: "Authenticated profile name", required: true },
  },
  run: (ctx) => {
    setDefaultProfile(ctx.values.name);
    return colors.green(`Profile "${ctx.values.name}" is now the default.`);
  },
});
