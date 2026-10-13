import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { cli } from "gunshi";
import { HttpResponse } from "msw";
import { setupServer } from "msw/node";

import { MOCK_TOKEN } from "../../../test/credentials.ts";
import { saveCredentials } from "../../config/credentials.ts";
import { handleGetWalletTxns } from "../../types/freee/msw.gen.ts";
import { walletTransactionListCommand } from "./list.ts";

const testDir = join(tmpdir(), `freee-cli-wallet-transaction-list-test-${Date.now()}`);
let requestUrl = "";

function walletTxn(id: number, status: 1 | 2 | 3 | 4 | 6) {
  return {
    id,
    company_id: 123,
    date: "2026-08-01",
    amount: 1000 * id,
    due_amount: 0,
    balance: 10000,
    entry_side: "expense" as const,
    walletable_type: "credit_card" as const,
    walletable_id: 55,
    description: `TXN-${id}`,
    status,
  };
}

const server = setupServer(
  handleGetWalletTxns(({ request }) => {
    requestUrl = request.url;
    return HttpResponse.json({
      wallet_txns: [
        walletTxn(1, 1),
        walletTxn(2, 2),
        walletTxn(3, 1),
        walletTxn(4, 3),
        walletTxn(5, 4),
        walletTxn(6, 6),
      ],
    });
  }),
);

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterAll(() => server.close());
beforeEach(() => {
  mkdirSync(testDir, { recursive: true });
  saveCredentials(testDir, { default: MOCK_TOKEN });
  process.env.FREEE_CLI_CONFIG_DIR = testDir;
  requestUrl = "";
});
afterEach(() => {
  server.resetHandlers();
  delete process.env.FREEE_CLI_CONFIG_DIR;
  rmSync(testDir, { recursive: true, force: true });
});

describe("wallet transaction list command", () => {
  test.each([
    ["unreconciled", [1, 3]],
    ["reconciled", [2]],
    ["ignored", [4]],
    ["in-progress", [5]],
    ["excluded", [6]],
  ] as const)("filters %s transactions locally", async (status, expectedIds) => {
    const result = await cli(
      ["--company-id", "123", "--status", status, "--format", "json"],
      walletTransactionListCommand,
    );

    expect(JSON.parse(String(result)).map((txn: { id: number }) => txn.id)).toEqual(expectedIds);
  });

  test("applies limit after local status filtering", async () => {
    const result = await cli(
      ["--company-id", "123", "--status", "unreconciled", "--limit", "1", "--format", "json"],
      walletTransactionListCommand,
    );

    expect(new URL(requestUrl).searchParams.get("limit")).toBe("100");
    expect(JSON.parse(String(result)).map((txn: { id: number }) => txn.id)).toEqual([1]);
  });

  test("passes wallet and entry-side filters through to freee", async () => {
    await cli(
      [
        "--company-id",
        "123",
        "--walletable-id",
        "55",
        "--walletable-type",
        "credit_card",
        "--entry-side",
        "expense",
        "--format",
        "json",
      ],
      walletTransactionListCommand,
    );

    const params = new URL(requestUrl).searchParams;
    expect(params.get("walletable_id")).toBe("55");
    expect(params.get("walletable_type")).toBe("credit_card");
    expect(params.get("entry_side")).toBe("expense");
  });

  test("requires walletable ID and type together", async () => {
    await expect(
      cli(["--company-id", "123", "--walletable-id", "55"], walletTransactionListCommand),
    ).rejects.toThrow(/together/);
  });
});
