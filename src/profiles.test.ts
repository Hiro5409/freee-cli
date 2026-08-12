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
  const storedProfiles = ["kakutei-shinkoku", "vab-labo"];

  test("an explicit profile overrides the environment and default", () => {
    expect(
      resolveProfile({
        requested: "vab-labo",
        environment: "kakutei-shinkoku",
        defaultProfile: "kakutei-shinkoku",
        storedProfiles,
      }),
    ).toBe("vab-labo");
  });

  test("FREEE_PROFILE overrides the persistent default", () => {
    expect(
      resolveProfile({
        environment: "kakutei-shinkoku",
        defaultProfile: "vab-labo",
        storedProfiles,
      }),
    ).toBe("kakutei-shinkoku");
  });

  test("uses the persistent default when it is authenticated", () => {
    expect(resolveProfile({ defaultProfile: "vab-labo", storedProfiles })).toBe("vab-labo");
  });

  test("uses the only authenticated profile when no default exists", () => {
    expect(resolveProfile({ storedProfiles: ["vab-labo"] })).toBe("vab-labo");
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
      resolveLoginProfile({ requested: "vab-labo", storedProfiles: ["kakutei-shinkoku"] }),
    ).toBe("vab-labo");
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
    expect(defaultProfileAfterLogin("default", [], "vab-labo", false)).toBe("vab-labo");
  });

  test("adding a profile preserves the existing default", () => {
    expect(defaultProfileAfterLogin("vab-labo", ["vab-labo"], "kakutei-shinkoku", false)).toBe(
      "vab-labo",
    );
  });

  test("set-default intentionally changes the default", () => {
    expect(defaultProfileAfterLogin("vab-labo", ["vab-labo"], "kakutei-shinkoku", true)).toBe(
      "kakutei-shinkoku",
    );
  });

  test("preserves the only usable profile when the configured default is stale", () => {
    expect(defaultProfileAfterLogin("missing", ["vab-labo"], "kakutei-shinkoku", false)).toBe(
      "vab-labo",
    );
  });
});

describe("stored profile configuration", () => {
  test("lists every authenticated profile with its default company", () => {
    saveCredentials(testDir, {
      "vab-labo": token,
      "kakutei-shinkoku": { ...token, accessToken: "other" },
    });
    saveConfig(testDir, {
      activeProfile: "vab-labo",
      defaults: { format: "table" },
      profiles: {
        "vab-labo": { companyId: 12672104, name: "VAB Labo" },
      },
    });

    expect(listProfiles(testDir)).toEqual([
      {
        profile: "kakutei-shinkoku",
        default: false,
        company_id: null,
        company_name: null,
      },
      {
        profile: "vab-labo",
        default: true,
        company_id: 12672104,
        company_name: "VAB Labo",
      },
    ]);
  });

  test("sets the default only to an authenticated profile", () => {
    saveCredentials(testDir, { "vab-labo": token });

    setDefaultProfile("vab-labo", testDir);
    expect(loadConfig(testDir).activeProfile).toBe("vab-labo");
    expect(() => setDefaultProfile("missing", testDir)).toThrow(AuthError);
  });
});
