import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, mock, test } from "bun:test";
import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { cli } from "gunshi";
import { HttpResponse } from "msw";
import { setupServer } from "msw/node";

import { MOCK_TOKEN } from "../../../test/credentials.ts";
import { saveCredentials } from "../../config/credentials.ts";
import { handleDestroyTransfer } from "../../types/freee/msw.gen.ts";
import { transferDeleteCommand } from "./delete.ts";

const testDir = join(tmpdir(), `freee-cli-transfer-delete-test-${Date.now()}`);
const onDelete = mock();
const server = setupServer(
  handleDestroyTransfer(({ params }) => {
    onDelete(params.id);
    return new HttpResponse(null, { status: 204 });
  }),
);

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterAll(() => server.close());
beforeEach(() => {
  onDelete.mockClear();
  mkdirSync(testDir, { recursive: true });
  saveCredentials(testDir, { default: MOCK_TOKEN });
  process.env.FREEE_CLI_CONFIG_DIR = testDir;
});
afterEach(() => {
  server.resetHandlers();
  delete process.env.FREEE_CLI_CONFIG_DIR;
  rmSync(testDir, { recursive: true, force: true });
});

describe("transfer delete command", () => {
  test("previews deletion without writing", async () => {
    const result = await cli(
      ["--company-id", "123", "--id", "42", "--dry-run", "--format", "json"],
      transferDeleteCommand,
    );
    expect(onDelete).not.toHaveBeenCalled();
    expect(JSON.parse(String(result))).toMatchObject({ request: { method: "DELETE" } });
  });

  test("deletes the selected transfer", async () => {
    await cli(["--company-id", "123", "--id", "42"], transferDeleteCommand);
    expect(onDelete).toHaveBeenCalledWith("42");
  });
});
