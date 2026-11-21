import { args, integer, merge, string } from "gunshi/combinators";

export const globalArgs = args({
  profile: string({
    description: "Connection profile (overrides FREEE_PROFILE and the configured default)",
  }),
});

export const companyArgs = merge(
  globalArgs,
  args({
    "company-id": integer({
      min: 1,
      max: Number.MAX_SAFE_INTEGER,
      description: "Override company ID from config",
    }),
  }),
);
