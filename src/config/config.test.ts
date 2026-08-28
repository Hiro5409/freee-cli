import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const testDir = join(tmpdir(), `freee-cli-test-${Date.now()}`);

beforeEach(() => {
  mkdirSync(testDir, { recursive: true });
});

afterEach(() => {
  rmSync(testDir, { recursive: true, force: true });
});

describe("config", () => {
  test("configDir rejects an environment without a home directory", async () => {
    const { configDir } = await import("./config.ts");
    expect(() => configDir({})).toThrow("HOME or USERPROFILE");
  });

  test("loadConfig returns defaults when file does not exist", async () => {
    const { loadConfig } = await import("./config.ts");
    const config = loadConfig(testDir);
    expect(config.activeProfile).toBe("default");
    expect(config.defaults.format).toBe("table");
  });

  test("loadConfig reads existing config.json", async () => {
    const { loadConfig } = await import("./config.ts");
    writeFileSync(
      join(testDir, "config.json"),
      JSON.stringify({
        activeProfile: "work",
        defaults: { format: "json" },
        profiles: {
          work: {
            companyId: 123,
            name: "Work Co",
            experimental: { web: { authProfile: "business-freee" } },
          },
        },
      }),
    );
    const config = loadConfig(testDir);
    expect(config.activeProfile).toBe("work");
    expect(config.defaults.format).toBe("json");
    expect(config.profiles.work?.companyId).toBe(123);
    expect(config.profiles.work?.experimental?.web.authProfile).toBe("business-freee");
  });

  test("saveConfig writes config.json and creates directory", async () => {
    const { saveConfig } = await import("./config.ts");
    const dir = join(testDir, "nested", "dir");
    saveConfig(dir, {
      activeProfile: "default",
      defaults: { format: "table" },
      profiles: {},
    });
    expect(existsSync(join(dir, "config.json"))).toBe(true);
  });

  test("loadConfig throws ConfigError for invalid JSON", async () => {
    const { loadConfig } = await import("./config.ts");
    const { ConfigError } = await import("../errors.ts");
    writeFileSync(join(testDir, "config.json"), "not json");
    expect(() => loadConfig(testDir)).toThrow(ConfigError);
  });

  test("loadConfig rejects invalid company IDs", async () => {
    const { loadConfig } = await import("./config.ts");
    const { ConfigError } = await import("../errors.ts");

    for (const companyId of ["123", 0, 1.5]) {
      writeFileSync(
        join(testDir, "config.json"),
        JSON.stringify({ profiles: { work: { companyId, name: "Work Co" } } }),
      );
      expect(() => loadConfig(testDir)).toThrow(ConfigError);
    }
  });

  test("loadConfig rejects unknown configuration keys", async () => {
    const { loadConfig } = await import("./config.ts");
    const { ConfigError } = await import("../errors.ts");
    writeFileSync(join(testDir, "config.json"), JSON.stringify({ activeProfiles: "work" }));
    expect(() => loadConfig(testDir)).toThrow(ConfigError);
  });

  test("loadConfig rejects unknown experimental Web configuration keys", async () => {
    const { loadConfig } = await import("./config.ts");
    const { ConfigError } = await import("../errors.ts");
    writeFileSync(
      join(testDir, "config.json"),
      JSON.stringify({
        profiles: {
          work: {
            companyId: 123,
            name: "Work Co",
            experimental: { web: { auth_profile: "business-freee" } },
          },
        },
      }),
    );
    expect(() => loadConfig(testDir)).toThrow(ConfigError);
  });
});

describe("credentials", () => {
  test("loadCredentials returns empty object when file does not exist", async () => {
    const { loadCredentials } = await import("./credentials.ts");
    const creds = loadCredentials(testDir);
    expect(creds).toEqual({});
  });

  test("loadCredentials reads existing credentials.json", async () => {
    const { loadCredentials } = await import("./credentials.ts");
    writeFileSync(
      join(testDir, "credentials.json"),
      JSON.stringify({
        default: {
          clientId: "abc",
          clientSecret: "secret",
          accessToken: "tok",
          refreshToken: "ref",
          expiresAt: 9999999999999,
        },
      }),
    );
    const creds = loadCredentials(testDir);
    expect(creds.default?.accessToken).toBe("tok");
  });

  test("loadCredentials rejects unknown token fields", async () => {
    const { loadCredentials } = await import("./credentials.ts");
    const { ConfigError } = await import("../errors.ts");
    writeFileSync(
      join(testDir, "credentials.json"),
      JSON.stringify({
        default: {
          clientId: "abc",
          clientSecret: "secret",
          accessToken: "tok",
          refreshToken: "ref",
          expiresAt: 9999999999999,
          access_token: "typo",
        },
      }),
    );
    expect(() => loadCredentials(testDir)).toThrow(ConfigError);
  });

  test("saveCredentials writes with 0o600 permission", async () => {
    const { saveCredentials } = await import("./credentials.ts");
    saveCredentials(testDir, {
      default: {
        clientId: "abc",
        clientSecret: "secret",
        accessToken: "tok",
        refreshToken: "ref",
        expiresAt: 9999999999999,
      },
    });
    const filePath = join(testDir, "credentials.json");
    expect(existsSync(filePath)).toBe(true);
    const stat = statSync(filePath);
    expect(stat.mode & 0o777).toBe(0o600);
  });

  test("saveCredentials creates directory if missing", async () => {
    const { saveCredentials } = await import("./credentials.ts");
    const dir = join(testDir, "deep", "path");
    saveCredentials(dir, {});
    expect(existsSync(join(dir, "credentials.json"))).toBe(true);
    expect(statSync(dir).mode & 0o777).toBe(0o700);
  });

  test("saveCredentials atomically replaces the credentials file", async () => {
    const { loadCredentials, saveCredentials } = await import("./credentials.ts");
    const original = {
      default: {
        clientId: "abc",
        clientSecret: "secret",
        accessToken: "old-token",
        refreshToken: "old-refresh",
        expiresAt: 9999999999999,
      },
    };
    saveCredentials(testDir, original);

    const filePath = join(testDir, "credentials.json");
    const originalFile = openSync(filePath, "r");
    try {
      saveCredentials(testDir, {
        default: {
          ...original.default,
          accessToken: "new-token",
          refreshToken: "new-refresh",
        },
      });

      const openFileContents = JSON.parse(readFileSync(originalFile, "utf-8"));
      expect(openFileContents.default.accessToken).toBe("old-token");
      expect(loadCredentials(testDir).default?.accessToken).toBe("new-token");
    } finally {
      closeSync(originalFile);
    }
  });

  test("saveCredentials refuses a credentials symlink", async () => {
    const { saveCredentials } = await import("./credentials.ts");
    const { ConfigError } = await import("../errors.ts");
    const targetPath = join(testDir, "target.json");
    writeFileSync(targetPath, "do not replace\n");
    symlinkSync(targetPath, join(testDir, "credentials.json"));

    expect(() => saveCredentials(testDir, {})).toThrow(ConfigError);
    expect(readFileSync(targetPath, "utf-8")).toBe("do not replace\n");
  });

  test("updateCredentials serializes mutations without losing profiles", async () => {
    const { loadCredentials, updateCredentials } = await import("./credentials.ts");
    let releaseFirst: (() => void) | undefined;
    let signalFirstStarted: (() => void) | undefined;
    const firstStarted = new Promise<void>((resolve) => {
      signalFirstStarted = resolve;
    });
    const firstCanFinish = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const token = {
      clientId: "abc",
      clientSecret: "secret",
      accessToken: "access",
      refreshToken: "refresh",
      expiresAt: 9999999999999,
    };

    const first = updateCredentials(testDir, async (credentials) => {
      credentials.first = { ...token, accessToken: "first" };
      signalFirstStarted?.();
      await firstCanFinish;
    });
    await firstStarted;

    let secondStarted = false;
    const second = updateCredentials(testDir, async (credentials) => {
      secondStarted = true;
      credentials.second = { ...token, accessToken: "second" };
    });
    await Bun.sleep(25);
    expect(secondStarted).toBe(false);

    releaseFirst?.();
    await Promise.all([first, second]);
    expect(loadCredentials(testDir)).toEqual({
      first: { ...token, accessToken: "first" },
      second: { ...token, accessToken: "second" },
    });
  });

  test("updateCredentials releases the lock without saving when the mutation fails", async () => {
    const { loadCredentials, updateCredentials } = await import("./credentials.ts");

    await expect(
      updateCredentials(testDir, async (credentials) => {
        credentials.failed = {
          clientId: "abc",
          clientSecret: "secret",
          accessToken: "access",
          refreshToken: "refresh",
          expiresAt: 9999999999999,
        };
        throw new Error("operation failed");
      }),
    ).rejects.toThrow("operation failed");

    await expect(updateCredentials(testDir, async () => "retried")).resolves.toBe("retried");
    expect(loadCredentials(testDir)).toEqual({});
  });

  test("updateCredentials holds an exclusive PID lockfile only while mutating", async () => {
    const { updateCredentials } = await import("./credentials.ts");
    const lockPath = join(testDir, "credentials.lockfile");

    await updateCredentials(testDir, () => {
      expect(readFileSync(lockPath, "utf-8")).toBe(`${process.pid}\n`);
      expect(statSync(lockPath).mode & 0o777).toBe(0o600);
    });

    expect(existsSync(lockPath)).toBe(false);
  });
});
