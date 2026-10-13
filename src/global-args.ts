import {
  args,
  boolean,
  choice,
  integer,
  merge,
  short,
  string,
  withDefault,
} from "gunshi/combinators";

export const globalArgs = args({
  format: withDefault(
    short(choice(["json", "table"] as const, { description: "Output format: json | table" }), "f"),
    "table",
  ),
  profile: string({
    description: "OAuth profile name (overrides FREEE_PROFILE and the configured default)",
  }),
  color: withDefault(boolean({ description: "Enable colored output", negatable: true }), true),
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
