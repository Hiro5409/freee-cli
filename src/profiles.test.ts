import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { loadConfig, saveConfig } from "./config/config.ts";
import { saveCredentials } from "./config/credentials.ts";
import { AuthError, ConfigError } from "./errors.ts";
import {
  assertProfileWritable,
  defaultProfileAfterLogin,
  listProfiles,
  resolveLoginProfile,
  resolveProfile,
  resolveProfileName,
  setDefaultProfile,
} from "./profiles.ts";

const testDir = join(tmpdir(), `freee-cli-profiles-test-${Date.now()}`);

beforeEach(() => {
  mkdirSync(testDir, { recursive: true });
});

afterEach(() => {
  rmSync(testDir, { recursive: true, force: true });
});

const token = {
  clientId: "client",
  clientSecret: "secret",
  accessToken: "access",
  refreshToken: "refresh",
  expiresAt: Date.now() + 60_000,
};

describe("resolveProfile", () => {
  const storedProfiles = ["kakutei-shinkoku", "sample-company"];

  test("an explicit profile overrides the environment and default", () => {
    expect(
      resolveProfile({
        requested: "sample-company",
        environment: "kakutei-shinkoku",
        defaultProfile: "kakutei-shinkoku",
        storedProfiles,
      }),
    ).toBe("sample-company");
  });

  test("FREEE_PROFILE overrides the persistent default", () => {
    expect(
      resolveProfile({
        environment: "kakutei-shinkoku",
        defaultProfile: "sample-company",
        storedProfiles,
      }),
    ).toBe("kakutei-shinkoku");
  });

  test("uses the persistent default when it is authenticated", () => {
    expect(resolveProfile({ defaultProfile: "sample-company", storedProfiles })).toBe(
      "sample-company",
    );
  });

  test("uses the only authenticated profile when no default exists", () => {
    expect(resolveProfile({ storedProfiles: ["sample-company"] })).toBe("sample-company");
  });

  test("rejects an unknown explicit profile", () => {
    expect(() => resolveProfile({ requested: "missing", storedProfiles })).toThrow(AuthError);
  });

  test("rejects an ambiguous selection", () => {
    expect(() => resolveProfile({ storedProfiles })).toThrow(ConfigError);
  });
});

describe("resolveProfileName", () => {
  test("allows a local dry-run before the first login", () => {
    expect(resolveProfileName({ defaultProfile: "default", storedProfiles: [] })).toBe("default");
  });

  test("preserves an explicit unauthenticated name for a local dry-run", () => {
    expect(resolveProfileName({ requested: "new-profile", storedProfiles: [] })).toBe(
      "new-profile",
    );
  });
});

describe("resolveLoginProfile", () => {
  test("uses default for the first login", () => {
    expect(resolveLoginProfile({ storedProfiles: [] })).toBe("default");
  });

  test("uses an explicit name for a new profile", () => {
    expect(
      resolveLoginProfile({ requested: "sample-company", storedProfiles: ["kakutei-shinkoku"] }),
    ).toBe("sample-company");
  });

  test("rejects profile names that cannot be stored safely", () => {
    expect(() => resolveLoginProfile({ requested: "__proto__", storedProfiles: [] })).toThrow(
      ConfigError,
    );
    expect(() => resolveLoginProfile({ requested: "work profile", storedProfiles: [] })).toThrow(
      ConfigError,
    );
  });
});

describe("assertProfileWritable", () => {
  test("does not silently replace credentials", () => {
    expect(() => assertProfileWritable("default", ["default"], false)).toThrow(AuthError);
  });

  test("allows an explicit replacement", () => {
    expect(() => assertProfileWritable("default", ["default"], true)).not.toThrow();
  });
});

describe("defaultProfileAfterLogin", () => {
  test("the first profile becomes the default", () => {
    expect(defaultProfileAfterLogin("default", [], "sample-company", false)).toBe("sample-company");
  });

  test("adding a profile preserves the existing default", () => {
    expect(
      defaultProfileAfterLogin("sample-company", ["sample-company"], "kakutei-shinkoku", false),
    ).toBe("sample-company");
  });

  test("set-default intentionally changes the default", () => {
    expect(
      defaultProfileAfterLogin("sample-company", ["sample-company"], "kakutei-shinkoku", true),
    ).toBe("kakutei-shinkoku");
  });

  test("preserves the only usable profile when the configured default is stale", () => {
    expect(defaultProfileAfterLogin("missing", ["sample-company"], "kakutei-shinkoku", false)).toBe(
      "sample-company",
    );
  });
});

describe("stored profile configuration", () => {
  test("lists every authenticated profile with its default company", () => {
    saveCredentials(testDir, {
      work: token,
      personal: { ...token, accessToken: "other" },
    });
    saveConfig(testDir, {
      activeProfile: "work",
      defaults: { format: "table" },
      profiles: {
        work: { companyId: 123, name: "Test Company" },
      },
    });

    expect(listProfiles(testDir)).toEqual([
      {
        profile: "personal",
        default: false,
        company_id: null,
        company_name: null,
      },
      {
        profile: "work",
        default: true,
        company_id: 123,
        company_name: "Test Company",
      },
    ]);
  });

  test("sets the default only to an authenticated profile", () => {
    saveCredentials(testDir, { "sample-company": token });

    setDefaultProfile("sample-company", testDir);
    expect(loadConfig(testDir).activeProfile).toBe("sample-company");
    expect(() => setDefaultProfile("missing", testDir)).toThrow(AuthError);
  });
});
