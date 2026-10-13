import type { TokenSet } from "../src/config/credentials.ts";

export const MOCK_TOKEN: TokenSet = {
  clientId: "test-client",
  clientSecret: "test-secret",
  accessToken: "test-token",
  refreshToken: "test-refresh",
  expiresAt: Date.now() + 3600000,
};
