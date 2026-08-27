import { createHash, randomBytes } from "node:crypto";

import * as v from "valibot";

import type { TokenSet } from "../config/credentials.ts";
import { AuthError } from "../errors.ts";

const TokenResponseSchema = v.object({
  access_token: v.string(),
  refresh_token: v.string(),
  expires_in: v.number(),
});

const FREEE_AUTH_BASE = "https://accounts.secure.freee.co.jp";
const AUTHORIZE_PATH = "/public_api/authorize";
const TOKEN_PATH = "/public_api/token";
const TOKEN_REFRESH_MARGIN_MS = 60_000;
export const CALLBACK_PORT = 8080;
export const CALLBACK_HOST = "localhost";
const REDIRECT_URI = `http://${CALLBACK_HOST}:${CALLBACK_PORT}/callback`;

export function generateCodeVerifier(): string {
  return randomBytes(64).toString("base64url").slice(0, 128);
}

export async function generateCodeChallenge(verifier: string): Promise<string> {
  const hash = createHash("sha256").update(verifier).digest();
  return hash.toString("base64url");
}

export function buildAuthorizationUrl(params: {
  clientId: string;
  codeChallenge: string;
  state: string;
}): string {
  const url = new URL(`${FREEE_AUTH_BASE}${AUTHORIZE_PATH}`);
  url.searchParams.set("client_id", params.clientId);
  url.searchParams.set("redirect_uri", REDIRECT_URI);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("code_challenge", params.codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("state", params.state);
  return url.toString();
}

async function postTokenEndpoint(
  body: Record<string, string>,
): Promise<v.InferOutput<typeof TokenResponseSchema>> {
  const res = await fetch(`${FREEE_AUTH_BASE}${TOKEN_PATH}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new AuthError(`Token request failed (${res.status}): ${text}`);
  }

  return v.parse(TokenResponseSchema, await res.json());
}

export async function exchangeCodeForToken(params: {
  clientId: string;
  clientSecret: string;
  code: string;
  codeVerifier: string;
}): Promise<TokenSet> {
  const data = await postTokenEndpoint({
    grant_type: "authorization_code",
    client_id: params.clientId,
    client_secret: params.clientSecret,
    code: params.code,
    redirect_uri: REDIRECT_URI,
    code_verifier: params.codeVerifier,
  });

  return {
    clientId: params.clientId,
    clientSecret: params.clientSecret,
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };
}

export async function refreshAccessToken(tokenSet: TokenSet): Promise<TokenSet> {
  const data = await postTokenEndpoint({
    grant_type: "refresh_token",
    client_id: tokenSet.clientId,
    client_secret: tokenSet.clientSecret,
    refresh_token: tokenSet.refreshToken,
  });

  return {
    ...tokenSet,
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };
}

export function getTokenStatus(tokenSet: TokenSet): { isValid: boolean; expiresAt: Date } {
  return {
    isValid: tokenSet.expiresAt - TOKEN_REFRESH_MARGIN_MS > Date.now(),
    expiresAt: new Date(tokenSet.expiresAt),
  };
}
