import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, mock, test } from "bun:test";
import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { cli } from "gunshi";
import { HttpResponse } from "msw";
import { setupServer } from "msw/node";

import { MOCK_TOKEN } from "../../../test/credentials.ts";
import { saveCredentials } from "../../config/credentials.ts";
import { handleDestroyWalletTxn } from "../../types/freee/msw.gen.ts";
import { walletTransactionDeleteCommand } from "./delete.ts";

const testDir = join(tmpdir(), `freee-cli-wallet-transaction-delete-test-${Date.now()}`);
const onDelete = mock();
const server = setupServer(
  handleDestroyWalletTxn(({ params }) => {
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

describe("wallet transaction delete command", () => {
  test("previews deletion without writing", async () => {
    const result = await cli(
      ["--company-id", "123", "--id", "7", "--dry-run", "--format", "json"],
      walletTransactionDeleteCommand,
    );
    expect(onDelete).not.toHaveBeenCalled();
    expect(JSON.parse(String(result))).toMatchObject({ request: { method: "DELETE" } });
  });

  test("deletes the selected wallet transaction", async () => {
    await cli(["--company-id", "123", "--id", "7"], walletTransactionDeleteCommand);
    expect(onDelete).toHaveBeenCalledWith("7");
  });
});
