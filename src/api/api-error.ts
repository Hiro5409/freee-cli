import { CliError, errorHints } from "../errors.ts";

type FreeeApiErrorPayload = {
  status_code?: number;
  errors?: Array<{ messages?: string[] }>;
  message?: string;
  messages?: string | string[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function messagesFrom(payload: FreeeApiErrorPayload): string[] {
  const nested = (payload.errors ?? []).flatMap((error) => error.messages ?? []);
  if (nested.length > 0) return nested;
  if (Array.isArray(payload.messages)) return payload.messages;
  const direct = payload.message ?? payload.messages;
  return direct ? [direct] : [];
}

function guidance(status: number): { exitCode?: number; why: string; hint: string } {
  if (status === 401) {
    return {
      exitCode: 2,
      why: "freee rejected the authentication credentials.",
      hint: errorHints.authentication,
    };
  }
  if (status === 403) {
    return {
      exitCode: 2,
      why: "The authenticated profile cannot access this company or resource.",
      hint: errorHints.access,
    };
  }
  if (status === 404) {
    return {
      why: "The requested freee resource was not found in the selected company.",
      hint: errorHints.notFound,
    };
  }
  if (status === 429) {
    return {
      why: "freee rate-limited the request.",
      hint: errorHints.retryLater,
    };
  }
  if (status >= 500) {
    return {
      why: "freee could not complete the request.",
      hint: errorHints.retryLater,
    };
  }
  return {
    why: "freee rejected the request parameters or current resource state.",
    hint: errorHints.invalidValue,
  };
}

export function freeeApiError(error: unknown): CliError | undefined {
  if (!isRecord(error) || error instanceof Error) return undefined;

  const payload = error as FreeeApiErrorPayload;
  const status = payload.status_code;
  const hasErrors = Array.isArray(payload.errors);
  const hasDirectMessage =
    typeof payload.message === "string" ||
    typeof payload.messages === "string" ||
    Array.isArray(payload.messages);
  if (status === undefined && !hasErrors && !hasDirectMessage) return undefined;

  const detail = messagesFrom(payload).join(" / ") || JSON.stringify(error);
  if (status === undefined && hasDirectMessage && !hasErrors) {
    return new CliError(`freee API error: ${detail}`, {
      exitCode: 2,
      why: "freee rejected the authentication credentials or resource access.",
      hint: errorHints.authenticationOrAccess,
    });
  }

  const resolvedStatus = status ?? 400;
  const statusLabel = status === undefined ? "unknown" : status;
  return new CliError(`freee API error (${statusLabel}): ${detail}`, guidance(resolvedStatus));
}
