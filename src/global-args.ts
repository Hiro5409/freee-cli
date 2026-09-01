export const globalArgs = {
  format: {
    type: "enum" as const,
    choices: ["json", "table"] as const,
    short: "f",
    description: "Output format: json | table",
    default: "table",
  },
  profile: {
    type: "string" as const,
    description: "OAuth profile name (overrides FREEE_PROFILE and the configured default)",
  },
  color: {
    type: "boolean" as const,
    description: "Enable colored output",
    default: true,
    negatable: true as const,
  },
};

export const companyArgs = {
  ...globalArgs,
  "company-id": {
    type: "string" as const,
    description: "Override company ID from config",
  },
};

export const listArgs = {
  ...companyArgs,
  limit: {
    type: "string" as const,
    description: "Maximum number of results",
  },
};

export const dryRunArgs = {
  ...companyArgs,
  "dry-run": {
    type: "boolean" as const,
    description: "Preview the exact write request without writing to freee",
    default: false,
  },
};
