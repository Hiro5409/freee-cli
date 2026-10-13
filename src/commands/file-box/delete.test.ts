import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { cli } from "gunshi";
import { HttpResponse } from "msw";
import { setupServer } from "msw/node";

import { MOCK_TOKEN } from "../../../test/credentials.ts";
import { saveCredentials } from "../../config/credentials.ts";
import { handleDestroyReceipt } from "../../types/freee/msw.gen.ts";
import { fileBoxDeleteCommand } from "./delete.ts";

const testDir = join(tmpdir(), `freee-cli-file-box-delete-test-${Date.now()}`);
const server = setupServer(handleDestroyReceipt(() => new HttpResponse(null, { status: 204 })));

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

describe("File Box delete command", () => {
  test("deletes a document", async () => {
    const result = await cli(
      ["--company-id", "123", "--id", "55", "--format", "json"],
      fileBoxDeleteCommand,
    );
    if (typeof result !== "string") throw new Error("expected string result");
    expect(JSON.parse(result)).toEqual({ id: 55, deleted: true });
  });
});
