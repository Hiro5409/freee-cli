import { CliError, type CliErrorCode, errorHints } from "../errors.ts";

type FreeeApiErrorContext = {
  product?: "invoice";
  status?: number;
};

type Guidance = {
  code: CliErrorCode;
  exitCode?: number;
  hint: string;
  why: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function strings(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string");
}

function messagesFrom(error: unknown): string[] {
  if (!isRecord(error)) return error instanceof Error ? [error.message] : [];

  const nested = Array.isArray(error.errors)
    ? error.errors.flatMap((entry) => (isRecord(entry) ? strings(entry.messages) : []))
    : [];
  if (nested.length > 0) return nested;

  const many = strings(error.messages);
  if (many.length > 0) return many;

  const direct = error.message ?? error.messages;
  return typeof direct === "string" ? [direct] : [];
}

function stringifyUnknown(value: unknown): string {
  try {
    const serialized: unknown = JSON.stringify(value);
    return typeof serialized === "string" ? serialized : String(value);
  } catch {
    return String(value);
  }
}

function guidance(status: number, product?: "invoice"): Guidance {
  if (status === 401) {
    return {
      code: "AUTHENTICATION",
      exitCode: 2,
      why:
        product === "invoice"
          ? "freee invoice API rejected the authentication credentials."
          : "freee rejected the authentication credentials.",
      hint: errorHints.authentication,
    };
  }
  if (status === 403) {
    return {
      code: "ACCESS_DENIED",
      exitCode: 2,
      why:
        product === "invoice"
          ? "The authenticated profile cannot access the freee invoice API for this company."
          : "The authenticated profile cannot access this company or resource.",
      hint: product === "invoice" ? errorHints.invoiceAccess : errorHints.access,
    };
  }
  if (status === 404) {
    return {
      code: "NOT_FOUND",
      why: "The requested freee resource was not found in the selected company.",
      hint: errorHints.notFound,
    };
  }
  if (status === 429) {
    return {
      code: "RATE_LIMITED",
      why: "freee rate-limited the request.",
      hint: errorHints.retryLater,
    };
  }
  if (status >= 500) {
    return {
      code: "UPSTREAM_FAILURE",
      why: "freee could not complete the request.",
      hint: errorHints.retryLater,
    };
  }
  return {
    code: "INVALID_INPUT",
    why: "freee rejected the request parameters or current resource state.",
    hint: errorHints.invalidValue,
  };
}

export function freeeApiError(error: unknown, context: FreeeApiErrorContext = {}): CliError {
  if (error instanceof CliError) return error;

  const messages = messagesFrom(error);
  const detail = messages.join(" / ") || stringifyUnknown(error);
  if (context.status === undefined) {
    return new CliError(`freee API request failed: ${detail}`, {
      cause: error,
      ...guidance(503, context.product),
    });
  }

  return new CliError(`freee API error (${context.status}): ${detail}`, {
    cause: error,
    ...guidance(context.status, context.product),
  });
}
