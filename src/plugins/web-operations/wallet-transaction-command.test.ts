import { describe, expect, test } from "bun:test";

import { OutcomeUnknownError } from "../../errors.ts";
import type { FreeeWebOperations, FreeeWebWalletTransaction } from "./freee-web.ts";
import {
  runWalletTransactionIgnoreCommand,
  runWalletTransactionRestoreCommand,
} from "./wallet-transaction-command.ts";

const scope = {
  profile: "business",
  companyId: 100,
  authProfile: "business-freee",
};

const webWalletTransaction: FreeeWebWalletTransaction = {
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

function dependencies(
  input: {
    webBefore?: Partial<FreeeWebWalletTransaction>;
    webAfter?: Partial<FreeeWebWalletTransaction>;
    writeError?: Error;
  } = {},
) {
  const webStates = [
    { ...webWalletTransaction, ...input.webBefore },
    {
      ...webWalletTransaction,
      status: 3,
      statusName: "ignored",
      ...input.webAfter,
    },
  ];
  let reads = 0;
  let writes = 0;
  const web = {
    walletTransaction: async () => {
      reads += 1;
      const state = webStates.shift();
      if (!state) throw new Error("unexpected web read");
      return state;
    },
    ignoreWalletTransaction: async () => {
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
    reads: () => reads,
    writes: () => writes,
  };
}

describe("wallet transaction ignore command", () => {
  test("trusts a successful Web write without rereading the transaction", async () => {
    const { deps, reads, writes } = dependencies();

    await expect(
      runWalletTransactionIgnoreCommand({ id: "42", profile: "business" }, deps),
    ).resolves.toMatchObject({
      profile: "business",
      companyId: 100,
      action: "ignore",
      ignored: true,
      target: { id: 42 },
    });
    expect(reads()).toBe(1);
    expect(writes()).toBe(1);
  });

  test("rejects a transaction from another company before writing", async () => {
    const { deps, writes } = dependencies({ webBefore: { companyId: 101 } });

    await expect(
      runWalletTransactionIgnoreCommand({ id: "42", profile: "business" }, deps),
    ).rejects.toThrow("does not belong to company 100");
    expect(writes()).toBe(0);
  });

  test("rejects an already processed transaction before writing", async () => {
    const { deps, writes } = dependencies({
      webBefore: { status: 2 },
    });

    await expect(
      runWalletTransactionIgnoreCommand({ id: "42", profile: "business" }, deps),
    ).rejects.toThrow("not unprocessed");
    expect(writes()).toBe(0);
  });

  test("does not reread or convert a definite Web rejection into success", async () => {
    const rejection = new Error("freee Web returned HTTP 409");
    const { deps, reads } = dependencies({ writeError: rejection });

    await expect(
      runWalletTransactionIgnoreCommand({ id: "42", profile: "business" }, deps),
    ).rejects.toBe(rejection);
    expect(reads()).toBe(1);
  });

  test("reports an unknown outcome when a lost write cannot be verified", async () => {
    const { deps, reads } = dependencies({
      webAfter: { status: 1 },
      writeError: new OutcomeUnknownError("write confirmation was lost"),
    });

    await expect(
      runWalletTransactionIgnoreCommand({ id: "42", profile: "business" }, deps),
    ).rejects.toBeInstanceOf(OutcomeUnknownError);
    expect(reads()).toBe(2);
  });

  test("accepts verified state after the write response was lost", async () => {
    const { deps, reads } = dependencies({
      writeError: new OutcomeUnknownError("write confirmation was lost"),
    });

    await expect(
      runWalletTransactionIgnoreCommand({ id: "42", profile: "business" }, deps),
    ).resolves.toMatchObject({ ignored: true, target: { id: 42 } });
    expect(reads()).toBe(2);
  });
});

const restoreWalletTransaction: FreeeWebWalletTransaction = {
  ...webWalletTransaction,
  status: 3,
  statusName: "ignored",
};

function restoreDependencies(
  input: {
    webBefore?: Partial<FreeeWebWalletTransaction>;
    webAfter?: Partial<FreeeWebWalletTransaction>;
    writeError?: Error;
  } = {},
) {
  const webStates = [
    { ...restoreWalletTransaction, ...input.webBefore },
    {
      ...restoreWalletTransaction,
      status: 1,
      statusName: "unreconciled",
      ...input.webAfter,
    },
  ];
  let reads = 0;
  let writes = 0;
  const web = {
    walletTransaction: async () => {
      reads += 1;
      const state = webStates.shift();
      if (!state) throw new Error("unexpected web read");
      return state;
    },
    restoreIgnoredWalletTransaction: async () => {
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
    reads: () => reads,
    writes: () => writes,
  };
}

describe("wallet transaction restore command", () => {
  test("trusts a successful Web write without rereading the transaction", async () => {
    const { deps, reads, writes } = restoreDependencies();

    await expect(
      runWalletTransactionRestoreCommand({ id: "42", profile: "business" }, deps),
    ).resolves.toMatchObject({
      profile: "business",
      companyId: 100,
      action: "restore",
      restored: true,
      target: { id: 42 },
    });
    expect(reads()).toBe(1);
    expect(writes()).toBe(1);
  });

  test("rejects a transaction that is not ignored before writing", async () => {
    const { deps, writes } = restoreDependencies({ webBefore: { status: 1 } });

    await expect(
      runWalletTransactionRestoreCommand({ id: "42", profile: "business" }, deps),
    ).rejects.toThrow("not ignored");
    expect(writes()).toBe(0);
  });

  test("rejects a transaction that freee Web has locked from recovery", async () => {
    const { deps, writes } = restoreDependencies({ webBefore: { recoveryLocked: true } });

    await expect(
      runWalletTransactionRestoreCommand({ id: "42", profile: "business" }, deps),
    ).rejects.toThrow("locked from recovery");
    expect(writes()).toBe(0);
  });

  test("accepts verified state after the write response was lost", async () => {
    const { deps, reads } = restoreDependencies({
      writeError: new OutcomeUnknownError("write confirmation was lost"),
    });

    await expect(
      runWalletTransactionRestoreCommand({ id: "42", profile: "business" }, deps),
    ).resolves.toMatchObject({ restored: true, target: { id: 42 } });
    expect(reads()).toBe(2);
  });
});
