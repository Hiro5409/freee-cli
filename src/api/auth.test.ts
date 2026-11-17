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

  test("the authorization URL binds the request to S256, its state, and the local callback", async () => {
    const { buildAuthorizationUrl } = await import("./auth.ts");
    const { searchParams } = new URL(
      buildAuthorizationUrl({
        clientId: "test-client-id",
        codeChallenge: "test-challenge",
        state: "test-state",
      }),
    );
    expect(searchParams.get("code_challenge_method")).toBe("S256");
    expect(searchParams.get("state")).toBe("test-state");
    expect(searchParams.get("redirect_uri")).toBe("http://localhost:8080/callback");
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
