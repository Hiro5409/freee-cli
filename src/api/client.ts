import ky, { isHTTPError } from "ky";

import type { TokenSet } from "../config/credentials.ts";
import { loadCredentials, updateCredentials } from "../config/credentials.ts";
import { AuthError } from "../errors.ts";
import { client as hrClient } from "../types/freee-hr/client.gen.ts";
import { client as invoiceClient } from "../types/freee-invoice/client.gen.ts";
import { client } from "../types/freee/client.gen.ts";
import { freeeApiError } from "./api-error.ts";
import { getTokenStatus, refreshAccessToken } from "./auth.ts";

export { client, hrClient, invoiceClient };

type FreeeClient = typeof client | typeof hrClient | typeof invoiceClient;

// Only reads are safe to retry automatically; writes can create accounting records.
// Hey API passes a fully constructed Request to its fetch implementation.
const apiFetch = Object.assign(
  (request: Parameters<typeof fetch>[0]) => ky(request, { retry: { methods: ["get", "head"] } }),
  { preconnect: fetch.preconnect },
);

// interceptor: setConfig({ auth }) + security は SDK 専用で raw call に効かない
function configure(
  target: FreeeClient,
  configDir: string,
  profile: string,
  product?: "invoice",
): void {
  target.setConfig({ fetch: apiFetch });
  target.interceptors.request.clear();
  target.interceptors.request.use(async (request: Request) => {
    const tokenSet = await ensureValidToken(configDir, profile);
    request.headers.set("Authorization", `Bearer ${tokenSet.accessToken}`);
    return request;
  });

  target.interceptors.response.clear();

  target.interceptors.error.clear();
  target.interceptors.error.use((error, response) => {
    if (isHTTPError(error)) {
      return freeeApiError(error.data ?? error, { product, status: error.response.status });
    }
    return freeeApiError(error, { product, status: response?.status });
  });
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
