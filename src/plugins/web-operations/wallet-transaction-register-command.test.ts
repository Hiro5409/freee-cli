import { describe, expect, test } from "bun:test";

import { OutcomeUnknownError } from "../../errors.ts";
import type { FreeeWebOperations, FreeeWebWalletTransaction } from "./freee-web.ts";
import { runWalletTransactionRegisterCommand } from "./wallet-transaction-register-command.ts";

const scope = {
  profile: "business",
  companyId: 100,
  authProfile: "business-freee",
};

const walletTransaction: FreeeWebWalletTransaction = {
  id: 42,
  companyId: 100,
  date: "2026-08-06",
  description: "AWS EMEA",
  entrySide: "expense",
  receivedAmount: 0,
  spentAmount: 1_000,
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
  debits: [{ accountItemName: "通信費", taxName: "課対仕入10%", amount: 1_000 }],
  credits: [{ accountItemName: "住信SBI", taxName: "対象外", amount: 1_000 }],
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
      dealIds: [91],
      ...input.after,
    },
  ];
  let previews = 0;
  let reads = 0;
  const writes: unknown[] = [];
  const registration = {
    walletTransaction,
    lines: [
      {
        accountItemName: "通信費",
        taxName: "課対仕入10%",
        amount: 1_000,
        description: "クラウド利用料",
      },
    ],
  };
  const web = {
    walletTransaction: async () => {
      reads += 1;
      const state = states.shift();
      if (!state) throw new Error("unexpected web read");
      return state;
    },
    previewWalletTransactionRegistration: async (received: unknown) => {
      previews += 1;
      expect(received).toEqual(registration);
      return preview;
    },
    registerWalletTransaction: async (received: unknown) => {
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
    registration,
  };
}

const values = {
  id: "42",
  "account-item-name": "通信費",
  "tax-name": "課対仕入10%",
  description: "クラウド利用料",
  profile: "business",
};

describe("wallet transaction register command", () => {
  test("dry-run derives the full amount and returns freee's registration preview", async () => {
    const { deps, previews, reads, writes } = dependencies();

    await expect(
      runWalletTransactionRegisterCommand({ ...values, "dry-run": true }, deps),
    ).resolves.toEqual({
      profile: "business",
      companyId: 100,
      action: "register",
      dryRun: true,
      target: {
        id: 42,
        date: "2026-08-06",
        description: "AWS EMEA",
        amount: 1_000,
        entrySide: "expense",
        walletableId: 300,
        walletableName: "住信SBI",
        updatedAt: "2026-08-06T12:00:00+09:00",
      },
      line: {
        accountItemName: "通信費",
        taxName: "課対仕入10%",
        amount: 1_000,
        description: "クラウド利用料",
      },
      preview,
    });
    expect(reads()).toBe(1);
    expect(previews()).toBe(1);
    expect(writes()).toEqual([]);
  });

  test("uses the wallet transaction description when no replacement is supplied", async () => {
    const { deps, reads, registration, writes } = dependencies();

    await expect(
      runWalletTransactionRegisterCommand(
        {
          id: "42",
          "account-item-name": "通信費",
          "tax-name": "課対仕入10%",
          profile: "business",
        },
        deps,
      ),
    ).resolves.toMatchObject({
      action: "register",
      registered: true,
      dealId: 91,
      line: { amount: 1_000, description: "AWS EMEA" },
    });
    expect(reads()).toBe(2);
    expect(writes()).toEqual([
      {
        ...registration,
        lines: [{ ...registration.lines[0], description: "AWS EMEA" }],
      },
    ]);
  });

  test("rejects a transaction that is not unprocessed before writing", async () => {
    const { deps, writes } = dependencies({ before: { status: 2 } });

    await expect(runWalletTransactionRegisterCommand(values, deps)).rejects.toThrow(
      "not unprocessed",
    );
    expect(writes()).toEqual([]);
  });

  test("accepts a verified Deal registration after write confirmation was lost", async () => {
    const { deps, reads } = dependencies({
      writeError: new OutcomeUnknownError("write confirmation was lost"),
    });

    await expect(runWalletTransactionRegisterCommand(values, deps)).resolves.toMatchObject({
      registered: true,
      dealId: 91,
    });
    expect(reads()).toBe(2);
  });

  test("reports an unknown outcome when a successful write cannot identify one Deal", async () => {
    const { deps } = dependencies({ after: { dealIds: [91, 92] } });

    await expect(runWalletTransactionRegisterCommand(values, deps)).rejects.toBeInstanceOf(
      OutcomeUnknownError,
    );
  });

  test("reports an unknown outcome when a lost write cannot be verified", async () => {
    const { deps } = dependencies({
      after: { status: 1, dealIds: [] },
      writeError: new OutcomeUnknownError("write confirmation was lost"),
    });

    await expect(runWalletTransactionRegisterCommand(values, deps)).rejects.toBeInstanceOf(
      OutcomeUnknownError,
    );
  });
});
