import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, mock, test } from "bun:test";
import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { cli } from "gunshi";
import { HttpResponse } from "msw";
import { setupServer } from "msw/node";

import { MOCK_TOKEN } from "../../../test/credentials.ts";
import { saveCredentials } from "../../config/credentials.ts";
import { handleCreateWalletTxn } from "../../types/freee/msw.gen.ts";
import { walletTransactionCreateCommand } from "./create.ts";

const testDir = join(tmpdir(), `freee-cli-wallet-transaction-create-test-${Date.now()}`);

const onCreateWalletTxn = mock();
let ruleMatched = true;

const server = setupServer(
  handleCreateWalletTxn(async ({ request }) => {
    const body = await request.json();
    onCreateWalletTxn(body);
    return HttpResponse.json(
      {
        wallet_txn: {
          id: 777,
          company_id: 123,
          date: "2026-08-01",
          amount: 5000,
          due_amount: 0,
          balance: 10000,
          entry_side: "expense",
          walletable_type: "credit_card",
          walletable_id: 55,
          description: "AMAZON.CO.JP",
          status: 1,
          ...(typeof body === "object" ? body : {}),
          rule_matched: ruleMatched,
        },
      },
      { status: 201 },
    );
  }),
);

beforeAll(() =>
  server.listen({
    onUnhandledRequest(request, print) {
      if (new URL(request.url).hostname === "accounts.secure.freee.co.jp") return;
      print.error();
    },
  }),
);
afterAll(() => server.close());

beforeEach(() => {
  onCreateWalletTxn.mockClear();
  ruleMatched = true;
  mkdirSync(testDir, { recursive: true });
  saveCredentials(testDir, { default: MOCK_TOKEN });
  process.env.FREEE_CLI_CONFIG_DIR = testDir;
});

afterEach(() => {
  server.resetHandlers();
  delete process.env.FREEE_CLI_CONFIG_DIR;
  rmSync(testDir, { recursive: true, force: true });
});

const baseArgs = [
  "--company-id",
  "123",
  "--date",
  "2026-08-01",
  "--entry-side",
  "expense",
  "--amount",
  "5000",
  "--walletable-id",
  "55",
  "--walletable-type",
  "credit_card",
  "--description",
  "AMAZON.CO.JP",
];

describe("wallet transaction create command", () => {
  test("reports the txn ID and that a rule matched", async () => {
    ruleMatched = true;
    const result = await cli(baseArgs, walletTransactionCreateCommand);

    if (typeof result !== "string") throw new Error("expected string result");
    expect(result).toContain("id=777");
    expect(result).toContain("rule matched: yes");
  });

  test("reports when no rule matched", async () => {
    ruleMatched = false;
    const result = await cli(baseArgs, walletTransactionCreateCommand);

    if (typeof result !== "string") throw new Error("expected string result");
    expect(result).toContain("id=777");
    expect(result).toContain("rule matched: no");
  });

  test("--format json returns the wallet_txn including rule_matched", async () => {
    const result = await cli([...baseArgs, "--format", "json"], walletTransactionCreateCommand);

    if (typeof result !== "string") throw new Error("expected string result");
    const txn = JSON.parse(result);
    expect(txn.id).toBe(777);
    expect(txn.rule_matched).toBe(true);
  });

  test("includes balance when provided", async () => {
    await cli([...baseArgs, "--balance", "40000"], walletTransactionCreateCommand);

    expect(onCreateWalletTxn).toHaveBeenCalledWith(expect.objectContaining({ balance: 40000 }));
  });

  test("rejects a calendar-invalid --date before calling the API", async () => {
    const args = baseArgs.map((a) => (a === "2026-08-01" ? "2026-02-30" : a));

    expect(cli(args, walletTransactionCreateCommand)).rejects.toThrow(/YYYY-MM-DD/);
    expect(onCreateWalletTxn).not.toHaveBeenCalled();
  });

  test("rejects a non-positive --walletable-id before calling the API", async () => {
    const args = baseArgs.map((a) => (a === "55" ? "0" : a));

    expect(cli(args, walletTransactionCreateCommand)).rejects.toThrow(/positive integer/);
    expect(onCreateWalletTxn).not.toHaveBeenCalled();
  });

  test("rejects a non-integer --amount before calling the API", async () => {
    const args = baseArgs.map((a) => (a === "5000" ? "50.5" : a));

    expect(cli(args, walletTransactionCreateCommand)).rejects.toThrow(/integer/);
    expect(onCreateWalletTxn).not.toHaveBeenCalled();
  });

  test("rejects an unknown --walletable-type before calling the API", async () => {
    const args = baseArgs.map((a) => (a === "credit_card" ? "paypay" : a));

    expect(cli(args, walletTransactionCreateCommand)).rejects.toThrow();
    expect(onCreateWalletTxn).not.toHaveBeenCalled();
  });

  test("creates a wallet transaction so freee evaluates active auto-registration rules", async () => {
    await cli(baseArgs, walletTransactionCreateCommand);

    expect(onCreateWalletTxn).toHaveBeenCalledTimes(1);
    expect(onCreateWalletTxn).toHaveBeenCalledWith({
      company_id: 123,
      date: "2026-08-01",
      entry_side: "expense",
      amount: 5000,
      walletable_id: 55,
      walletable_type: "credit_card",
      description: "AMAZON.CO.JP",
    });
  });
});
