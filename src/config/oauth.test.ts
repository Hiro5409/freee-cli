import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { loadOAuthCredentials } from "./oauth.ts";

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
