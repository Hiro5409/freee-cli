import { args, boolean, integer, merge, string, withDefault } from "gunshi/combinators";

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

export const listArgs = merge(
  companyArgs,
  args({
    limit: integer({
      min: 1,
      max: Number.MAX_SAFE_INTEGER,
      description: "Maximum number of results",
    }),
  }),
);

export const dryRunArgs = merge(
  companyArgs,
  args({
    "dry-run": withDefault(
      boolean({ description: "Preview the exact write request without writing to freee" }),
      false,
    ),
  }),
);
