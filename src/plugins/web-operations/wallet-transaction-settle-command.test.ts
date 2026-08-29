import { describe, expect, test } from "bun:test";

import { OutcomeUnknownError } from "../../errors.ts";
import type { FreeeWebOperations, FreeeWebWalletTransaction } from "./freee-web.ts";
import { runWalletTransactionSettleCommand } from "./wallet-transaction-settle-command.ts";

const scope = {
  profile: "business",
  companyId: 100,
  authProfile: "business-freee",
};

const walletTransaction: FreeeWebWalletTransaction = {
  id: 42,
  companyId: 100,
  date: "2026-08-06",
  description: "振込＊ド）バブラボ",
  entrySide: "income",
  receivedAmount: 34_025,
  spentAmount: 0,
  status: 1,
  statusName: "unreconciled",
  recoveryLocked: false,
  updatedAt: "2026-08-06T12:00:00+09:00",
  walletableId: 300,
  walletableName: "住信SBI",
  dealIds: [],
  transferIds: [],
  suggestionContext: {},
};

const preview = [
  {
    date: "2026-08-06",
    rows: 1,
    debits: [{ accountItemName: "普通預金", taxName: "対象外", amount: 10_000 }],
    credits: [{ accountItemName: "売掛金", taxName: "対象外", amount: 10_000 }],
  },
];

function dependencies(
  input: {
    before?: Partial<FreeeWebWalletTransaction>;
    after?: Partial<FreeeWebWalletTransaction>;
    writeError?: Error;
  } = {},
) {
  const states = [
    { ...walletTransaction, ...input.before },
    {
      ...walletTransaction,
      status: 2,
      statusName: "reconciled",
      dealIds: [91],
      ...input.after,
    },
  ];
  let previews = 0;
  let reads = 0;
  let writes = 0;
  const web = {
    walletTransaction: async () => {
      reads += 1;
      const state = states.shift();
      if (!state) throw new Error("unexpected web read");
      return state;
    },
    previewWalletTransactionSettlement: async (received: unknown) => {
      previews += 1;
      expect(received).toEqual({ walletTransaction, dealId: 91, amount: 10_000 });
      return preview;
    },
    settleWalletTransaction: async () => {
      writes += 1;
      if (input.writeError) throw input.writeError;
      return { walletTransactionId: 42 };
    },
  } as unknown as FreeeWebOperations;

  return {
    deps: {
      resolveScope: () => scope,
      withWeb: async <T>(
        receivedScope: { companyId: number; authProfile: string },
        run: (receivedWeb: FreeeWebOperations) => Promise<T>,
      ) => {
        expect(receivedScope).toMatchObject({ companyId: 100, authProfile: "business-freee" });
        return run(web);
      },
    },
    previews: () => previews,
    reads: () => reads,
    writes: () => writes,
  };
}

describe("wallet transaction settle command", () => {
  test("dry-run returns freee's settlement preview without writing", async () => {
    const { deps, previews, reads, writes } = dependencies();

    await expect(
      runWalletTransactionSettleCommand(
        { id: "42", "deal-id": "91", amount: "10000", profile: "business", "dry-run": true },
        deps,
      ),
    ).resolves.toEqual({
      profile: "business",
      companyId: 100,
      action: "settle",
      dryRun: true,
      dealId: 91,
      amount: 10_000,
      target: {
        id: 42,
        date: "2026-08-06",
        description: "振込＊ド）バブラボ",
        amount: 34_025,
        entrySide: "income",
        walletableId: 300,
        walletableName: "住信SBI",
        updatedAt: "2026-08-06T12:00:00+09:00",
      },
      preview,
    });
    expect(reads()).toBe(1);
    expect(previews()).toBe(1);
    expect(writes()).toBe(0);
  });

  test("settles once without requesting a preview or rereading after success", async () => {
    const { deps, previews, reads, writes } = dependencies();

    await expect(
      runWalletTransactionSettleCommand(
        { id: "42", "deal-id": "91", amount: "10000", profile: "business" },
        deps,
      ),
    ).resolves.toMatchObject({
      profile: "business",
      companyId: 100,
      action: "settle",
      settled: true,
      dealId: 91,
      amount: 10_000,
      target: { id: 42 },
    });
    expect(reads()).toBe(1);
    expect(previews()).toBe(0);
    expect(writes()).toBe(1);
  });

  test("rejects a transaction that is not unprocessed before writing", async () => {
    const { deps, writes } = dependencies({ before: { status: 2 } });

    await expect(
      runWalletTransactionSettleCommand(
        { id: "42", "deal-id": "91", amount: "10000", profile: "business" },
        deps,
      ),
    ).rejects.toThrow("not unprocessed");
    expect(writes()).toBe(0);
  });

  test("accepts a verified settlement after write confirmation was lost", async () => {
    const { deps, reads } = dependencies({
      writeError: new OutcomeUnknownError("write confirmation was lost"),
    });

    await expect(
      runWalletTransactionSettleCommand(
        { id: "42", "deal-id": "91", amount: "10000", profile: "business" },
        deps,
      ),
    ).resolves.toMatchObject({ settled: true, dealId: 91 });
    expect(reads()).toBe(2);
  });

  test("reports an unknown outcome when a lost write cannot be verified", async () => {
    const { deps } = dependencies({
      after: { status: 1, dealIds: [] },
      writeError: new OutcomeUnknownError("write confirmation was lost"),
    });

    await expect(
      runWalletTransactionSettleCommand(
        { id: "42", "deal-id": "91", amount: "10000", profile: "business" },
        deps,
      ),
    ).rejects.toBeInstanceOf(OutcomeUnknownError);
  });
});
