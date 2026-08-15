export const errorHints = {
  authentication:
    'Authentication is interactive. Ask the user to run "freee login --profile <name>", then retry with --profile <name>.',
  company:
    'Run "freee company-list --format json", then pass --company-id or select it with "freee company-switch".',
  positiveId: "Pass a positive integer ID. Use the corresponding list command to find one.",
  invalidValue: "Correct the value shown in the error and retry the command.",
  oneIdentifier: "Pass exactly one of the supported identifiers and retry the command.",
  invoiceAccess:
    "Confirm that the authenticated profile can access the freee invoice API, then retry.",
  access:
    "Confirm the selected --profile, --company-id, and freee permissions, then retry the same command.",
  notFound:
    "Read the resource list with the same --profile and --company-id, then retry with an ID from that result.",
  retryLater:
    "Wait before retrying the same command. Keep the request unchanged until it succeeds.",
} as const;

export type CliErrorCode =
  | "ACCESS_DENIED"
  | "AUTHENTICATION"
  | "CONFIGURATION"
  | "INVALID_INPUT"
  | "NOT_FOUND"
  | "PARTIAL_SUCCESS"
  | "RATE_LIMITED"
  | "UNEXPECTED"
  | "UPSTREAM_FAILURE";

type CliErrorOptions = {
  cause?: unknown;
  code: CliErrorCode;
  exitCode?: number;
  hint?: string;
  why?: string;
};

export class CliError extends Error {
  readonly code: CliErrorCode;
  readonly exitCode: number;
  readonly why?: string;
  readonly hint?: string;

  constructor(message: string, options: CliErrorOptions) {
    super(message, "cause" in options ? { cause: options.cause } : undefined);
    this.name = "CliError";
    this.code = options.code;
    this.exitCode = options.exitCode ?? 1;
    this.why = options.why;
    this.hint = options.hint;
  }
}

export class AuthError extends CliError {
  constructor(message: string) {
    super(message, {
      code: "AUTHENTICATION",
      exitCode: 2,
      why: "Authentication credentials are missing or invalid.",
      hint: errorHints.authentication,
    });
    this.name = "AuthError";
  }
}

export class ConfigError extends CliError {
  constructor(message: string) {
    super(message, { code: "CONFIGURATION", exitCode: 3 });
    this.name = "ConfigError";
  }
}
