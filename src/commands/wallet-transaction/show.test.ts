import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { cli } from "gunshi";
import { HttpResponse } from "msw";
import { setupServer } from "msw/node";

import { MOCK_TOKEN } from "../../../test/credentials.ts";
import { saveCredentials } from "../../config/credentials.ts";
import { handleGetWalletTxn } from "../../types/freee/msw.gen.ts";
import { walletTransactionShowCommand } from "./show.ts";

const testDir = join(tmpdir(), `freee-cli-wallet-transaction-show-test-${Date.now()}`);
const txn = {
  id: 7,
  company_id: 123,
  date: "2026-08-01",
  amount: 5000,
  due_amount: 0,
  balance: 10000,
  entry_side: "expense" as const,
  walletable_type: "credit_card" as const,
  walletable_id: 55,
  description: "TEST",
  status: 1,
  rule_matched: false,
};
const server = setupServer(handleGetWalletTxn(() => HttpResponse.json({ wallet_txn: txn })));

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

describe("wallet transaction show command", () => {
  test("shows one wallet transaction", async () => {
    const result = await cli(
      ["--company-id", "123", "--id", "7", "--format", "json"],
      walletTransactionShowCommand,
    );
    expect(JSON.parse(String(result))).toMatchObject({ id: 7, status: 1 });
  });
});
