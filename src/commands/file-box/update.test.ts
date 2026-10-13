import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { cli } from "gunshi";
import { setupServer } from "msw/node";

import { MOCK_TOKEN } from "../../../test/credentials.ts";
import { saveCredentials } from "../../config/credentials.ts";
import { handleUpdateReceipt } from "../../types/freee/msw.gen.ts";
import { fileBoxUpdateCommand } from "./update.ts";

const testDir = join(tmpdir(), `freee-cli-file-box-update-test-${Date.now()}`);
const server = setupServer(
  handleUpdateReceipt({
    body: {
      receipt: {
        id: 55,
        status: "confirmed",
        origin: "public_api",
        description: "書籍",
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

describe("File Box update command", () => {
  test("updates document metadata", async () => {
    const result = await cli(
      [
        "--company-id",
        "123",
        "--id",
        "55",
        "--description",
        "書籍",
        "--document-type",
        "receipt",
        "--dry-run",
        "--format",
        "json",
      ],
      fileBoxUpdateCommand,
    );
    if (typeof result !== "string") throw new Error("expected string result");
    expect(JSON.parse(result).request.body).toEqual({
      company_id: 123,
      description: "書籍",
      document_type: "receipt",
    });
  });
});
