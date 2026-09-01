import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, rmSync, truncateSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { cli } from "gunshi";
import { setupServer } from "msw/node";

import { MOCK_TOKEN } from "../../../test/credentials.ts";
import { saveCredentials } from "../../config/credentials.ts";
import { handleCreateReceipt } from "../../types/freee/msw.gen.ts";
import { fileBoxUploadCommand } from "./upload.ts";

const testDir = join(tmpdir(), `freee-cli-file-box-upload-test-${Date.now()}`);
const server = setupServer(
  handleCreateReceipt({
    body: {
      receipt: {
        id: 55,
        status: "confirmed",
        origin: "public_api",
        description: "receipt.pdf",
        mime_type: "application/pdf",
        created_at: "2026-08-13T10:00:00+09:00",
        user: { id: 1, email: "tester@example.com", display_name: "Tester" },
      },
    },
  }),
);

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterAll(() => server.close());
beforeEach(() => {
  mkdirSync(testDir, { recursive: true });
  saveCredentials(testDir, { default: MOCK_TOKEN });
  process.env.FREEE_CLI_CONFIG_DIR = testDir;
});
afterEach(() => {
  server.resetHandlers();
  delete process.env.FREEE_CLI_CONFIG_DIR;
  rmSync(testDir, { recursive: true, force: true });
});

describe("File Box upload command", () => {
  test("accepts a regular file for upload", async () => {
    const file = join(testDir, "receipt.pdf");
    writeFileSync(file, "receipt");

    const result = await cli(
      ["--company-id", "123", "--file", file, "--format", "json"],
      fileBoxUploadCommand,
    );

    expect(JSON.parse(String(result)).id).toBe(55);
  });

  test("rejects unreadable upload targets and files over the API limit", async () => {
    const missing = join(testDir, "missing.pdf");
    await expect(
      cli(["--company-id", "123", "--file", missing], fileBoxUploadCommand),
    ).rejects.toThrow();
    await expect(
      cli(["--company-id", "123", "--file", testDir], fileBoxUploadCommand),
    ).rejects.toThrow("not a regular file");

    const large = join(testDir, "large.pdf");
    writeFileSync(large, "");
    truncateSync(large, 64 * 1024 * 1024 + 1);
    await expect(
      cli(["--company-id", "123", "--file", large], fileBoxUploadCommand),
    ).rejects.toThrow("64 MB");
  });
});
