import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const testDir = join(tmpdir(), `freee-cli-auth-test-${Date.now()}`);

beforeEach(() => {
  mkdirSync(testDir, { recursive: true });
});

afterEach(() => {
  rmSync(testDir, { recursive: true, force: true });
});

describe("PKCE helpers", () => {
  test("generateCodeVerifier returns 43-128 char string", async () => {
    const { generateCodeVerifier } = await import("./auth.ts");
    const verifier = generateCodeVerifier();
    expect(verifier.length).toBeGreaterThanOrEqual(43);
    expect(verifier.length).toBeLessThanOrEqual(128);
    expect(verifier).toMatch(/^[A-Za-z0-9\-._~]+$/);
  });

  test("generateCodeVerifier returns unique values", async () => {
    const { generateCodeVerifier } = await import("./auth.ts");
    const a = generateCodeVerifier();
    const b = generateCodeVerifier();
    expect(a).not.toBe(b);
  });

  test("generateCodeChallenge returns Base64URL SHA-256", async () => {
    const { generateCodeChallenge } = await import("./auth.ts");
    const challenge = await generateCodeChallenge("test-verifier");
    expect(challenge).toBeString();
    expect(challenge).not.toContain("+");
    expect(challenge).not.toContain("/");
    expect(challenge).not.toContain("=");
  });
});

describe("buildAuthorizationUrl", () => {
  test("returns valid freee authorization URL", async () => {
    const { buildAuthorizationUrl } = await import("./auth.ts");
    const url = buildAuthorizationUrl({
      clientId: "test-client-id",
      codeChallenge: "test-challenge",
      state: "test-state",
    });
    const parsed = new URL(url);
    expect(parsed.origin).toBe("https://accounts.secure.freee.co.jp");
    expect(parsed.pathname).toBe("/public_api/authorize");
    expect(parsed.searchParams.get("client_id")).toBe("test-client-id");
    expect(parsed.searchParams.get("redirect_uri")).toBe("http://localhost:8080/callback");
    expect(parsed.searchParams.get("response_type")).toBe("code");
    expect(parsed.searchParams.get("code_challenge")).toBe("test-challenge");
    expect(parsed.searchParams.get("code_challenge_method")).toBe("S256");
    expect(parsed.searchParams.get("state")).toBe("test-state");
  });
});

describe("auth logout", () => {
  test("removes profile from credentials", async () => {
    const { saveCredentials, loadCredentials } = await import("../config/credentials.ts");
    saveCredentials(testDir, {
      default: {
        clientId: "abc",
        clientSecret: "secret",
        accessToken: "tok",
        refreshToken: "ref",
        expiresAt: 9999999999999,
      },
    });
    const { removeProfile } = await import("./auth.ts");
    await removeProfile(testDir, "default");
    const creds = loadCredentials(testDir);
    expect(creds.default).toBeUndefined();
  });
});

describe("auth status", () => {
  test("getTokenStatus returns valid/expired status", async () => {
    const { getTokenStatus } = await import("./auth.ts");

    const validStatus = getTokenStatus({
      clientId: "abc",
      clientSecret: "secret",
      accessToken: "tok",
      refreshToken: "ref",
      expiresAt: Date.now() + 3600000,
    });
    expect(validStatus.isValid).toBe(true);

    const expiredStatus = getTokenStatus({
      clientId: "abc",
      clientSecret: "secret",
      accessToken: "tok",
      refreshToken: "ref",
      expiresAt: Date.now() - 1000,
    });
    expect(expiredStatus.isValid).toBe(false);
  });
});
