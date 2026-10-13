import { define } from "gunshi";
import { args, merge, required, string } from "gunshi/combinators";
import colors from "yoctocolors";

import { globalArgs } from "../../global-args.ts";
import { setDefaultProfile } from "../../profiles.ts";

export const profileSetDefaultCommand = define({
  name: "profile-set-default",
  description: "Set the profile used when no override is provided",
  args: merge(
    globalArgs,
    args({ name: required(string({ description: "Authenticated profile name" })) }),
  ),
  run: (ctx) => {
    setDefaultProfile(ctx.values.name);
    return colors.green(`Profile "${ctx.values.name}" is now the default.`);
  },
});
