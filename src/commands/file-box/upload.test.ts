import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, rmSync, truncateSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { cli } from "gunshi";

import { MOCK_TOKEN } from "../../../test/credentials.ts";
import { saveCredentials } from "../../config/credentials.ts";
import { fileBoxUploadCommand } from "./upload.ts";

const testDir = join(tmpdir(), `freee-cli-file-box-upload-test-${Date.now()}`);

beforeEach(() => {
  mkdirSync(testDir, { recursive: true });
  saveCredentials(testDir, { default: MOCK_TOKEN });
  process.env.FREEE_CLI_CONFIG_DIR = testDir;
});
afterEach(() => {
  delete process.env.FREEE_CLI_CONFIG_DIR;
  rmSync(testDir, { recursive: true, force: true });
});

describe("File Box upload command", () => {
  test("accepts a regular file for upload", async () => {
    const file = join(testDir, "receipt.pdf");
    writeFileSync(file, "receipt");

    const result = await cli(
      ["--company-id", "123", "--file", file, "--dry-run", "--format", "json"],
      fileBoxUploadCommand,
    );

    expect(JSON.parse(String(result)).request.body.file).toBe(file);
  });

  test("rejects unreadable upload targets and files over the API limit", async () => {
    const missing = join(testDir, "missing.pdf");
    await expect(
      cli(["--company-id", "123", "--file", missing, "--dry-run"], fileBoxUploadCommand),
    ).rejects.toThrow();
    await expect(
      cli(["--company-id", "123", "--file", testDir, "--dry-run"], fileBoxUploadCommand),
    ).rejects.toThrow("not a regular file");

    const large = join(testDir, "large.pdf");
    writeFileSync(large, "");
    truncateSync(large, 64 * 1024 * 1024 + 1);
    await expect(
      cli(["--company-id", "123", "--file", large, "--dry-run"], fileBoxUploadCommand),
    ).rejects.toThrow("64 MB");
  });
});
