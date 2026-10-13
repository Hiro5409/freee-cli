import { expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { cli } from "gunshi";

import { MOCK_TOKEN } from "../../../test/credentials.ts";
import { loadCredentials, saveCredentials } from "../../config/credentials.ts";
import { logoutCommand } from "./logout.ts";

test("logout removes only the selected profile", async () => {
  const dir = mkdtempSync(join(tmpdir(), "freee-cli-logout-test-"));
  process.env.FREEE_CLI_CONFIG_DIR = dir;

  try {
    saveCredentials(dir, {
      default: MOCK_TOKEN,
      work: { ...MOCK_TOKEN, accessToken: "work-token" },
    });

    await cli(["--profile", "work"], logoutCommand);

    expect(loadCredentials(dir)).toEqual({ default: MOCK_TOKEN });
  } finally {
    delete process.env.FREEE_CLI_CONFIG_DIR;
    rmSync(dir, { recursive: true, force: true });
  }
});
