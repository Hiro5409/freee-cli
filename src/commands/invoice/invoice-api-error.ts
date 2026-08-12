import { CliError, errorHints } from "../../errors.ts";

type FreeeErrorPayload = {
  status_code?: number;
  errors?: Array<{ type?: string; messages?: string[] }>;
  message?: string;
  messages?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function collectMessages(payload: FreeeErrorPayload): string[] {
  const fromErrors = (payload.errors ?? []).flatMap((entry) => entry.messages ?? []);
  if (fromErrors.length > 0) return fromErrors;

  const single = payload.message ?? payload.messages;
  return single ? [single] : [];
}

/**
 * Translate what the freee invoice API throws into a CLI-shaped error.
 *
 * The generated client rejects with the parsed response body, so the status
 * lives in `status_code` and the human text in `errors[].messages`.
 */
export function invoiceApiError(error: unknown): CliError {
  if (error instanceof CliError) return error;

  if (isRecord(error)) {
    const payload = error as FreeeErrorPayload;
    const messages = collectMessages(payload);
    const detail = messages.join(" / ");

    if (payload.status_code === 403) {
      return new CliError(`freee invoice API refused the request: ${detail}`, {
        exitCode: 2,
        why: "The authorized freee application has no access to the 請求書 (invoice) API for this company.",
        hint: errorHints.invoiceAccess,
      });
    }

    // 401 bodies carry only a message, so the absence of status_code is the signal.
    if (payload.status_code === 401 || (payload.status_code === undefined && detail)) {
      return new CliError(`freee invoice API rejected the credentials: ${detail}`, {
        exitCode: 2,
        why: "The access token is missing, expired, or not valid for the 請求書 API.",
        hint: errorHints.authentication,
      });
    }

    if (detail) {
      return new CliError(`freee invoice API error: ${detail}`, {
        why: `freee responded with status ${payload.status_code ?? "unknown"}.`,
        hint: errorHints.invalidValue,
      });
    }

    return new CliError(`freee invoice API error: ${JSON.stringify(error)}`, {
      hint: errorHints.invalidValue,
    });
  }

  if (error instanceof Error) {
    return new CliError(`freee invoice API request failed: ${error.message}`, {
      hint: errorHints.invalidValue,
    });
  }

  return new CliError(`freee invoice API error: ${String(error)}`, {
    hint: errorHints.invalidValue,
  });
}
