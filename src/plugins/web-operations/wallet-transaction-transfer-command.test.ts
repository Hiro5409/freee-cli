import { describe, expect, test } from "bun:test";

import { OutcomeUnknownError } from "../../errors.ts";
import type { FreeeWebOperations, FreeeWebWalletTransaction } from "./freee-web.ts";
import { runWalletTransactionTransferCommand } from "./wallet-transaction-transfer-command.ts";

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
  entrySide: "expense",
  receivedAmount: 0,
  spentAmount: 34_025,
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

const preview = {
  date: "2026-08-06",
  rows: 1,
  debits: [{ accountItemName: "事業主借", taxName: null, amount: 34_025 }],
  credits: [{ accountItemName: "住信SBI", taxName: null, amount: 34_025 }],
};

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
      transferIds: [501],
      ...input.after,
    },
  ];
  let previews = 0;
  let reads = 0;
  const writes: unknown[] = [];
  const web = {
    walletTransaction: async () => {
      reads += 1;
      const state = states.shift();
      if (!state) throw new Error("unexpected web read");
      return state;
    },
    previewWalletTransactionTransfer: async (received: unknown) => {
      previews += 1;
      expect(received).toEqual({
        walletTransaction,
        counterpartyWalletableName: "事業主借",
        description: "資金移動",
      });
      return preview;
    },
    registerWalletTransactionTransfer: async (received: unknown) => {
      writes.push(received);
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

describe("wallet transaction transfer command", () => {
  test("dry-run returns freee's transfer preview without writing", async () => {
    const { deps, previews, reads, writes } = dependencies();

    await expect(
      runWalletTransactionTransferCommand(
        {
          id: "42",
          "counterparty-walletable-name": "事業主借",
          description: "資金移動",
          profile: "business",
          "dry-run": true,
        },
        deps,
      ),
    ).resolves.toEqual({
      profile: "business",
      companyId: 100,
      action: "transfer",
      dryRun: true,
      counterpartyWalletableName: "事業主借",
      description: "資金移動",
      target: {
        id: 42,
        date: "2026-08-06",
        description: "振込＊ド）バブラボ",
        amount: 34_025,
        entrySide: "expense",
        walletableId: 300,
        walletableName: "住信SBI",
        updatedAt: "2026-08-06T12:00:00+09:00",
      },
      preview,
    });
    expect(reads()).toBe(1);
    expect(previews()).toBe(1);
    expect(writes()).toEqual([]);
  });

  test("registers one transfer without requesting a preview or rereading after success", async () => {
    const { deps, previews, reads, writes } = dependencies();

    await expect(
      runWalletTransactionTransferCommand(
        {
          id: "42",
          "counterparty-walletable-name": "事業主借",
          profile: "business",
        },
        deps,
      ),
    ).resolves.toMatchObject({
      profile: "business",
      companyId: 100,
      action: "transfer",
      transferred: true,
      counterpartyWalletableName: "事業主借",
      description: "",
      target: { id: 42 },
    });
    expect(reads()).toBe(1);
    expect(previews()).toBe(0);
    expect(writes()).toEqual([
      {
        walletTransaction,
        counterpartyWalletableName: "事業主借",
        description: "",
      },
    ]);
  });

  test("rejects a transaction that is not unprocessed before writing", async () => {
    const { deps, writes } = dependencies({ before: { status: 2 } });

    await expect(
      runWalletTransactionTransferCommand(
        {
          id: "42",
          "counterparty-walletable-name": "事業主借",
          profile: "business",
        },
        deps,
      ),
    ).rejects.toThrow("not unprocessed");
    expect(writes()).toEqual([]);
  });

  test("accepts a verified transfer after write confirmation was lost", async () => {
    const { deps, reads } = dependencies({
      writeError: new OutcomeUnknownError("write confirmation was lost"),
    });

    await expect(
      runWalletTransactionTransferCommand(
        {
          id: "42",
          "counterparty-walletable-name": "事業主借",
          profile: "business",
        },
        deps,
      ),
    ).resolves.toMatchObject({ transferred: true });
    expect(reads()).toBe(2);
  });

  test("reports an unknown outcome when a lost write cannot be verified", async () => {
    const { deps } = dependencies({
      after: { status: 1, transferIds: [] },
      writeError: new OutcomeUnknownError("write confirmation was lost"),
    });

    await expect(
      runWalletTransactionTransferCommand(
        {
          id: "42",
          "counterparty-walletable-name": "事業主借",
          profile: "business",
        },
        deps,
      ),
    ).rejects.toBeInstanceOf(OutcomeUnknownError);
  });
});
