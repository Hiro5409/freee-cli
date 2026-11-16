import { define } from "gunshi";

import { globalArgs } from "../../global-args.ts";
import { listProfiles } from "../../profiles.ts";

export const profileListCommand = define({
  name: "list",
  description: "List authenticated profiles and their default companies",
  args: globalArgs,
  run: () => JSON.stringify(listProfiles()),
});
