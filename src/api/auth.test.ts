import { describe, expect, test } from "bun:test";

describe("PKCE helpers", () => {
  test("generateCodeVerifier returns 43-128 char string", async () => {
    const { generateCodeVerifier } = await import("./auth.ts");
    const verifier = generateCodeVerifier();
    expect(verifier.length).toBeGreaterThanOrEqual(43);
    expect(verifier.length).toBeLessThanOrEqual(128);
    expect(verifier).toMatch(/^[A-Za-z0-9\-._~]+$/);
  });

  test("code challenge matches the RFC 7636 S256 example", async () => {
    const { generateCodeChallenge } = await import("./auth.ts");
    // RFC 7636 Appendix B: https://datatracker.ietf.org/doc/html/rfc7636#appendix-B
    const challenge = await generateCodeChallenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk");
    expect(challenge).toBe("E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
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

describe("auth status", () => {
  test("getTokenStatus treats a token near expiry as invalid", async () => {
    const { getTokenStatus } = await import("./auth.ts");

    const validStatus = getTokenStatus({
      clientId: "abc",
      clientSecret: "secret",
      accessToken: "tok",
      refreshToken: "ref",
      expiresAt: Date.now() + 3600000,
    });
    expect(validStatus.isValid).toBe(true);

    const expiringStatus = getTokenStatus({
      clientId: "abc",
      clientSecret: "secret",
      accessToken: "tok",
      refreshToken: "ref",
      expiresAt: Date.now() + 30_000,
    });
    expect(expiringStatus.isValid).toBe(false);

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
