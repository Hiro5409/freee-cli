import type { TokenSet } from "../config/credentials.ts";
import { loadCredentials, updateCredentials } from "../config/credentials.ts";
import { AuthError } from "../errors.ts";
import { client as hrClient } from "../types/freee-hr/client.gen.ts";
import { client as invoiceClient } from "../types/freee-invoice/client.gen.ts";
import { client } from "../types/freee/client.gen.ts";
import { freeeApiError } from "./api-error.ts";
import { getTokenStatus, refreshAccessToken } from "./auth.ts";

// freee publishes product APIs as separate schemas and base URLs. Each generated
// client shares the same OAuth token and request behavior.
export { client, hrClient, invoiceClient };

type FreeeClient = typeof client | typeof hrClient | typeof invoiceClient;

const RETRYABLE_STATUSES = new Set([429, 502, 503, 504]);
const READ_ONLY_METHODS = new Set(["GET", "HEAD"]);
const MAX_RETRY_DELAY_MS = 30_000;

type Sleep = (ms: number, signal?: AbortSignal) => Promise<void>;

const abortError = (signal: AbortSignal): Error =>
  signal.reason instanceof Error
    ? signal.reason
    : new DOMException("The operation was aborted.", "AbortError");

const sleep: Sleep = (ms, signal) =>
  new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortError(signal));
      return;
    }

    const timeout = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timeout);
        reject(abortError(signal));
      },
      { once: true },
    );
  });

function retryDelayMs(response: Response, attempt: number): number | undefined {
  const retryAfter = response.headers.get("Retry-After");
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds) && seconds >= 0) {
      const delay = seconds * 1000;
      return delay <= MAX_RETRY_DELAY_MS ? delay : undefined;
    }

    const dateMs = Date.parse(retryAfter);
    if (!Number.isNaN(dateMs)) {
      const delay = Math.max(0, dateMs - Date.now());
      return delay <= MAX_RETRY_DELAY_MS ? delay : undefined;
    }
  }

  const base = 250 * 2 ** (attempt - 1);
  const jitter = Math.floor(Math.random() * 100);
  return base + jitter;
}

function shouldRetry(request: Request, response: Response): boolean {
  return (
    READ_ONLY_METHODS.has(request.method.toUpperCase()) && RETRYABLE_STATUSES.has(response.status)
  );
}

async function retryReadOnlyResponse(
  response: Response,
  request: Request,
  options: { fetch?: typeof fetch },
): Promise<Response> {
  const maxRetries = 2;
  let current = response;

  for (let attempt = 1; attempt <= maxRetries && shouldRetry(request, current); attempt += 1) {
    const delay = retryDelayMs(current, attempt);
    if (delay === undefined) return current;
    await sleep(delay, request.signal);

    let next: Response;
    try {
      next = await (options.fetch ?? globalThis.fetch)(new Request(request));
    } catch {
      return current;
    }

    await current.body?.cancel();
    current = next;
  }

  return current;
}

// interceptor: setConfig({ auth }) + security は SDK 専用で raw call に効かない
function configure(
  target: FreeeClient,
  configDir: string,
  profile: string,
  product?: "invoice",
): void {
  target.interceptors.request.clear();
  target.interceptors.request.use(async (request: Request) => {
    const tokenSet = await ensureValidToken(configDir, profile);
    request.headers.set("Authorization", `Bearer ${tokenSet.accessToken}`);
    return request;
  });

  target.interceptors.response.clear();
  target.interceptors.response.use(retryReadOnlyResponse);

  target.interceptors.error.clear();
  target.interceptors.error.use((error, response) =>
    freeeApiError(error, { product, status: response?.status }),
  );
}

export function configureClient(configDir: string, profile: string): void {
  configure(client, configDir, profile);
  configure(hrClient, configDir, profile);
  configure(invoiceClient, configDir, profile, "invoice");
}

// Promise sharing coalesces refreshes within this process. The credentials file lock
// serializes separate CLI processes, which must reload after acquiring it because a
// previous process may already have rotated the one-time refresh token.
const refreshPromises = new Map<string, Promise<TokenSet>>();

function refreshKey(configDir: string, profile: string): string {
  return `${configDir}\0${profile}`;
}

async function refreshTokenWithLock(configDir: string, profile: string): Promise<TokenSet> {
  return updateCredentials(configDir, async (credentials) => {
    const currentTokenSet = credentials[profile];

    if (!currentTokenSet) {
      throw new AuthError(`No credentials for profile "${profile}". Run "freee login" first.`);
    }

    if (getTokenStatus(currentTokenSet).isValid) {
      return currentTokenSet;
    }

    let refreshed: TokenSet;
    try {
      refreshed = await refreshAccessToken(currentTokenSet);
    } catch (error) {
      if (error instanceof AuthError) {
        throw new AuthError(
          `${error.message}\nRun "freee login --profile ${profile} --replace" to re-authenticate.`,
        );
      }
      throw error;
    }
    credentials[profile] = refreshed;
    return refreshed;
  });
}

async function ensureValidToken(configDir: string, profile: string): Promise<TokenSet> {
  const creds = loadCredentials(configDir);
  const tokenSet = creds[profile];

  if (!tokenSet) {
    throw new AuthError(`No credentials for profile "${profile}". Run "freee login" first.`);
  }

  if (getTokenStatus(tokenSet).isValid) {
    return tokenSet;
  }

  const key = refreshKey(configDir, profile);
  if (!refreshPromises.has(key)) {
    const refreshPromise = refreshTokenWithLock(configDir, profile).finally(() => {
      refreshPromises.delete(key);
    });
    refreshPromises.set(key, refreshPromise);
  }
  const refreshPromise = refreshPromises.get(key);
  if (!refreshPromise) {
    throw new AuthError("Token refresh did not start.");
  }
  return refreshPromise;
}
