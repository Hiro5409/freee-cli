import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { loadOAuthCredentials, saveOAuthCredentials } from "./oauth.ts";

const testDir = join(tmpdir(), `freee-cli-oauth-test-${Date.now()}`);

afterEach(() => rmSync(testDir, { recursive: true, force: true }));

describe("loadOAuthCredentials", () => {
  test("loads setup credentials from the config directory", () => {
    mkdirSync(testDir, { recursive: true });
    writeFileSync(
      join(testDir, "oauth.env"),
      "FREEE_CLIENT_ID=client\nFREEE_CLIENT_SECRET=test=value\n",
    );
    expect(loadOAuthCredentials(testDir)).toEqual({
      clientId: "client",
      clientSecret: "test=value",
    });
  });

  test("returns undefined when setup has not stored credentials", () => {
    expect(loadOAuthCredentials(testDir)).toBeUndefined();
  });

  test("rejects a symlinked credential file", () => {
    mkdirSync(testDir, { recursive: true });
    const target = join(testDir, "target");
    writeFileSync(target, "FREEE_CLIENT_ID=client\nFREEE_CLIENT_SECRET=secret\n");
    symlinkSync(target, join(testDir, "oauth.env"));
    expect(() => loadOAuthCredentials(testDir)).toThrow("symbolic link");
  });
});

describe("saveOAuthCredentials", () => {
  test("stores credentials in a private directory and file", () => {
    saveOAuthCredentials(testDir, { clientId: "client", clientSecret: "test=value" });

    expect(loadOAuthCredentials(testDir)).toEqual({
      clientId: "client",
      clientSecret: "test=value",
    });
    expect(statSync(testDir).mode & 0o777).toBe(0o700);
    expect(statSync(join(testDir, "oauth.env")).mode & 0o777).toBe(0o600);
  });

  test("replaces both values without retaining unrelated content", () => {
    mkdirSync(testDir, { recursive: true });
    writeFileSync(
      join(testDir, "oauth.env"),
      "UNRELATED=value\nFREEE_CLIENT_ID=old\nFREEE_CLIENT_SECRET=old-secret\n",
    );

    saveOAuthCredentials(testDir, { clientId: "new", clientSecret: "new-secret" });

    expect(readFileSync(join(testDir, "oauth.env"), "utf-8")).toBe(
      "FREEE_CLIENT_ID=new\nFREEE_CLIENT_SECRET=new-secret\n",
    );
  });

  test("rejects a symlinked credential file", () => {
    mkdirSync(testDir, { recursive: true });
    const target = join(testDir, "target");
    writeFileSync(target, "unchanged");
    symlinkSync(target, join(testDir, "oauth.env"));

    expect(() =>
      saveOAuthCredentials(testDir, { clientId: "client", clientSecret: "secret" }),
    ).toThrow("symbolic link");
    expect(readFileSync(target, "utf-8")).toBe("unchanged");
  });

  test("rejects values that cannot be represented in the env file", () => {
    expect(() =>
      saveOAuthCredentials(testDir, { clientId: "client\ninjected", clientSecret: "secret" }),
    ).toThrow("line breaks");
  });
});
