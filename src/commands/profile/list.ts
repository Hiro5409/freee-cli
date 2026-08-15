import { define } from "gunshi";

import { globalArgs } from "../../global-args.ts";
import { formatOutput } from "../../output/formatter.ts";
import { listProfiles } from "../../profiles.ts";

export const profileListCommand = define({
  name: "profile-list",
  description: "List authenticated profiles and their default companies",
  args: globalArgs,
  run: (ctx) => formatOutput(listProfiles(), ctx.values.format),
});
