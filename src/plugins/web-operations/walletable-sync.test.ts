import { describe, expect, test } from "bun:test";

import { OutcomeUnknownError } from "../../errors.ts";
import type { FreeeWebWalletableSummary, FreeeWebWalletableSyncState } from "./freee-web.ts";
import {
  createWalletableSync,
  type WalletableSyncProgress,
  type WalletableSyncWeb,
} from "./walletable-sync.ts";

function walletable(input: {
  id: number;
  name: string;
  type: "bank_account" | "credit_card";
  status?: string;
  lastSyncedAt?: string | null;
  connected?: boolean;
  limited?: boolean;
  failure?: string | null;
}) {
  return {
    id: input.id,
    name: input.name,
    type: input.type,
    status: input.status ?? "synced",
    lastSyncedAt:
      input.lastSyncedAt === undefined ? "2026-08-24T01:00:00.000Z" : input.lastSyncedAt,
    connectedServiceId: input.connected === false ? null : input.id + 1000,
    isSyncFrequencyLimited: input.limited ?? false,
    syncFailedReason: input.failure ?? null,
  };
}

function summary(
  walletables: ReturnType<typeof walletable>[],
  options: { hasSyncing?: boolean; available?: boolean; ready?: boolean } = {},
) {
  return {
    walletables,
    hasSyncing: options.hasSyncing ?? false,
    canSyncAll: options.available ?? true,
    readyToSyncAll: options.ready ?? true,
  };
}

function scriptedWeb(values: unknown[]) {
  const requests: Array<
    | { operation: "summary" }
    | { operation: "start"; type: string; id: number }
    | { operation: "state"; type: string; id: number }
    | { operation: "start-bulk" }
  > = [];
  const next = (): unknown => {
    const value = values.shift();
    if (value === undefined) throw new Error("unexpected request");
    if (value instanceof Error) throw value;
    return value;
  };
  const web: WalletableSyncWeb = {
    async walletableSummary() {
      requests.push({ operation: "summary" });
      return next() as FreeeWebWalletableSummary;
    },
    async startWalletableSync(type, id) {
      requests.push({ operation: "start", type, id });
      next();
    },
    async walletableSyncState(type, id) {
      requests.push({ operation: "state", type, id });
      return next() as FreeeWebWalletableSyncState;
    },
    async startBulkWalletableSync() {
      requests.push({ operation: "start-bulk" });
      next();
    },
  };
  return { web, requests };
}

function immediatePolling() {
  let now = 0;
  return {
    timeoutMs: 10,
    pollIntervalMs: 1,
    now: () => now,
    sleep: async (milliseconds: number) => {
      now += milliseconds;
    },
  };
}

describe("walletable sync", () => {
  test("resolves the walletable type and confirms one sync completed", async () => {
    const progress: WalletableSyncProgress[] = [];
    const { web, requests } = scriptedWeb([
      summary([walletable({ id: 20, name: "Card", type: "credit_card" })]),
      {},
      {
        status: "syncing",
        lastSyncedAt: "2026-08-24T01:05:00.000Z",
        syncFailedReason: null,
      },
      {
        status: "syncing",
        lastSyncedAt: "2026-08-24T01:05:00.000Z",
        syncFailedReason: null,
      },
      {
        status: "synced",
        lastSyncedAt: "2026-08-24T01:10:00.000Z",
        syncFailedReason: null,
      },
    ]);
    const sync = createWalletableSync({
      web,
      polling: immediatePolling(),
      onProgress: (event) => progress.push(event),
    });

    await expect(sync({ kind: "one", walletableId: 20 })).resolves.toEqual({
      walletables: [
        {
          walletableId: 20,
          walletableName: "Card",
          walletableType: "credit_card",
          status: "synced",
          lastSyncedAt: "2026-08-24T01:10:00.000Z",
        },
      ],
    });
    expect(requests).toEqual([
      { operation: "summary" },
      { operation: "start", type: "credit_card", id: 20 },
      { operation: "state", type: "credit_card", id: 20 },
      { operation: "state", type: "credit_card", id: 20 },
      { operation: "state", type: "credit_card", id: 20 },
    ]);
    expect(progress).toEqual([
      {
        kind: "walletable",
        walletableId: 20,
        walletableName: "Card",
        walletableType: "credit_card",
        status: "started",
      },
      {
        kind: "walletable",
        walletableId: 20,
        walletableName: "Card",
        walletableType: "credit_card",
        status: "syncing",
      },
      {
        kind: "walletable",
        walletableId: 20,
        walletableName: "Card",
        walletableType: "credit_card",
        status: "synced",
      },
    ]);
  });

  test("confirms all connected and unrestricted walletables completed", async () => {
    const progress: WalletableSyncProgress[] = [];
    const bank = walletable({ id: 10, name: "Bank", type: "bank_account" });
    const card = walletable({ id: 20, name: "Card", type: "credit_card" });
    const disconnected = walletable({
      id: 30,
      name: "Disconnected",
      type: "bank_account",
      connected: false,
    });
    const limited = walletable({ id: 40, name: "Limited", type: "credit_card", limited: true });
    const skipped = walletable({
      id: 50,
      name: "Skipped by freee",
      type: "credit_card",
      failure: "old provider error",
    });
    const { web, requests } = scriptedWeb([
      summary([bank, card, disconnected, limited, skipped]),
      {},
      summary([
        { ...bank, lastSyncedAt: "2026-08-24T01:05:00.000Z" },
        { ...card, lastSyncedAt: "2026-08-24T01:05:01.000Z" },
        disconnected,
        limited,
        skipped,
      ]),
    ]);
    const sync = createWalletableSync({
      web,
      polling: immediatePolling(),
      onProgress: (event) => progress.push(event),
    });

    const result = await sync({ kind: "all" });

    if (!("walletables" in result)) throw new Error("expected completed walletables");
    expect(result.walletables.map(({ walletableId }) => walletableId)).toEqual([10, 20]);
    expect(requests).toEqual([
      { operation: "summary" },
      { operation: "start-bulk" },
      { operation: "summary" },
    ]);
    expect(progress).toEqual([
      { kind: "bulk", status: "started" },
      {
        kind: "walletable",
        walletableId: 10,
        walletableName: "Bank",
        walletableType: "bank_account",
        status: "synced",
      },
      {
        kind: "walletable",
        walletableId: 20,
        walletableName: "Card",
        walletableType: "credit_card",
        status: "synced",
      },
    ]);
  });

  test("does not start all when freee says it is unavailable or not ready", async () => {
    for (const options of [{ available: false }, { ready: false }]) {
      const { web, requests } = scriptedWeb([
        summary([walletable({ id: 10, name: "Bank", type: "bank_account" })], options),
      ]);
      const sync = createWalletableSync({ web, polling: immediatePolling() });

      await expect(sync({ kind: "all" })).rejects.toThrow("freee");
      expect(requests.filter(({ operation }) => operation.startsWith("start"))).toHaveLength(0);
    }
  });

  test("reports observed failures", async () => {
    const card = walletable({ id: 20, name: "Card", type: "credit_card" });
    const { web } = scriptedWeb([
      summary([card]),
      {},
      {
        status: "failed",
        lastSyncedAt: card.lastSyncedAt,
        syncFailedReason: "provider unavailable",
      },
    ]);
    const sync = createWalletableSync({ web, polling: immediatePolling() });

    await expect(sync({ kind: "one", walletableId: 20 })).rejects.toThrow("provider unavailable");
  });

  test("does not mistake a retained previous failure for the current individual sync", async () => {
    const card = walletable({
      id: 20,
      name: "Card",
      type: "credit_card",
      failure: "old provider error",
    });
    const { web } = scriptedWeb([
      summary([card]),
      {},
      {
        status: "syncing",
        lastSyncedAt: card.lastSyncedAt,
        syncFailedReason: "old provider error",
      },
      {
        status: "synced",
        lastSyncedAt: "2026-08-24T01:05:00.000Z",
        syncFailedReason: "old provider error",
      },
    ]);
    const sync = createWalletableSync({ web, polling: immediatePolling() });

    await expect(sync({ kind: "one", walletableId: 20 })).resolves.toMatchObject({
      walletables: [{ walletableId: 20, status: "synced" }],
    });
  });

  test("reports a retained failure when the participating individual sync terminates", async () => {
    const card = walletable({
      id: 20,
      name: "Card",
      type: "credit_card",
      failure: "provider unavailable",
    });
    const { web } = scriptedWeb([
      summary([card]),
      {},
      {
        status: "syncing",
        lastSyncedAt: card.lastSyncedAt,
        syncFailedReason: "provider unavailable",
      },
      {
        status: "failed",
        lastSyncedAt: card.lastSyncedAt,
        syncFailedReason: "provider unavailable",
      },
    ]);
    const sync = createWalletableSync({ web, polling: immediatePolling() });

    await expect(sync({ kind: "one", walletableId: 20 })).rejects.toThrow("provider unavailable");
  });

  test("reports a new failure from sync all", async () => {
    const card = walletable({ id: 20, name: "Card", type: "credit_card" });
    const { web } = scriptedWeb([
      summary([card]),
      {},
      summary([{ ...card, status: "failed", syncFailedReason: "provider unavailable" }]),
    ]);
    const sync = createWalletableSync({ web, polling: immediatePolling() });

    await expect(sync({ kind: "all" })).rejects.toThrow("provider unavailable");
  });

  test("reports the same failure after a walletable participated", async () => {
    const card = walletable({
      id: 20,
      name: "Card",
      type: "credit_card",
      failure: "provider unavailable",
    });
    const { web } = scriptedWeb([
      summary([card]),
      {},
      summary([{ ...card, status: "syncing" }], { hasSyncing: true }),
      summary([{ ...card, status: "failed" }]),
    ]);
    let now = 0;
    const sync = createWalletableSync({
      web,
      polling: {
        timeoutMs: 2,
        pollIntervalMs: 1,
        now: () => now++,
        sleep: async () => {},
      },
    });

    await expect(sync({ kind: "all" })).rejects.toThrow("provider unavailable");
  });

  test("times out naming only unfinished participants from sync all", async () => {
    const bank = walletable({ id: 10, name: "Bank", type: "bank_account" });
    const skipped = walletable({ id: 20, name: "Skipped", type: "credit_card" });
    const { web } = scriptedWeb([
      summary([bank, skipped]),
      {},
      summary([{ ...bank, status: "syncing" }, skipped], { hasSyncing: true }),
    ]);
    const sync = createWalletableSync({
      web,
      polling: {
        timeoutMs: 1,
        pollIntervalMs: 1,
        now: (() => {
          let now = 0;
          return () => now++;
        })(),
        sleep: async () => {},
      },
    });

    const error = await sync({ kind: "all" }).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(OutcomeUnknownError);
    expect(String(error)).toContain("Bank");
    expect(String(error)).not.toContain("Skipped");
  });

  test("times out naming every candidate when sync all never starts", async () => {
    const bank = walletable({ id: 10, name: "Bank", type: "bank_account" });
    const card = walletable({ id: 20, name: "Card", type: "credit_card" });
    const { web } = scriptedWeb([summary([bank, card]), {}, summary([bank, card])]);
    const sync = createWalletableSync({
      web,
      polling: {
        timeoutMs: 1,
        pollIntervalMs: 1,
        now: (() => {
          let now = 0;
          return () => now++;
        })(),
        sleep: async () => {},
      },
    });

    const error = await sync({ kind: "all" }).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(OutcomeUnknownError);
    expect(String(error)).toContain("Bank, Card");
  });

  test("classifies polling failure after sync starts as outcome unknown", async () => {
    const card = walletable({ id: 20, name: "Card", type: "credit_card" });
    const { web, requests } = scriptedWeb([
      summary([card]),
      {},
      new Error("status request failed"),
    ]);
    const sync = createWalletableSync({ web, polling: immediatePolling() });

    const result = sync({ kind: "one", walletableId: 20 });

    await expect(result).rejects.toBeInstanceOf(OutcomeUnknownError);
    await expect(result).rejects.toMatchObject({ code: "OUTCOME_UNKNOWN" });
    expect(requests.filter(({ operation }) => operation.startsWith("start"))).toHaveLength(1);
  });

  test("does not treat an unchanged timestamp as completion", async () => {
    const initial = walletable({ id: 20, name: "Card", type: "credit_card" });
    const { web, requests } = scriptedWeb([
      summary([initial]),
      {},
      {
        status: "synced",
        lastSyncedAt: initial.lastSyncedAt,
        syncFailedReason: null,
      },
      {
        status: "synced",
        lastSyncedAt: initial.lastSyncedAt,
        syncFailedReason: null,
      },
    ]);
    const sync = createWalletableSync({
      web,
      polling: {
        timeoutMs: 1,
        pollIntervalMs: 1,
        now: (() => {
          let now = 0;
          return () => now++;
        })(),
        sleep: async () => {},
      },
    });

    const result = sync({ kind: "one", walletableId: 20 });
    await expect(result).rejects.toBeInstanceOf(OutcomeUnknownError);
    await expect(result).rejects.toThrow("completion was not confirmed");
    expect(requests.filter(({ operation }) => operation.startsWith("start"))).toHaveLength(1);
  });
});
