import { describe, expect, test } from "bun:test";

import * as v from "valibot";

import { OutcomeUnknownError } from "../../errors.ts";
import type { FreeeWebClient } from "./freee-web-client.ts";
import { createWalletableSync, type WalletableSyncProgress } from "./walletable-sync.ts";

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
    walletable_id: input.id,
    name: input.name,
    walletable_type: input.type,
    walletable_status: input.status ?? "synced",
    last_synced_at:
      input.lastSyncedAt === undefined ? "2026-08-24T01:00:00.000Z" : input.lastSyncedAt,
    connected_service_id: input.connected === false ? null : input.id + 1000,
    is_sync_frequency_limited: input.limited ?? false,
    sync_failed_reason: input.failure ?? null,
  };
}

function summary(
  walletables: ReturnType<typeof walletable>[],
  options: { hasSyncing?: boolean; available?: boolean; ready?: boolean } = {},
) {
  return {
    walletables,
    summary: {
      has_syncing: options.hasSyncing ?? false,
      available_sync_all: options.available ?? true,
      ready_to_sync_all: options.ready ?? true,
    },
  };
}

function scriptedClient(values: unknown[]) {
  const requests: Array<{ method: string; path: string }> = [];
  const client: FreeeWebClient = {
    close: async () => {},
    async request(request, schema) {
      requests.push(request);
      const value = values.shift();
      if (value === undefined) throw new Error("unexpected request");
      if (value instanceof Error) throw value;
      const parsed = v.safeParse(schema, value);
      if (!parsed.success) throw new Error("fixture failed observed schema");
      return parsed.output;
    },
  };
  return { client, requests };
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
  test("previews one walletable request without claiming bulk eligibility", async () => {
    const { client, requests } = scriptedClient([
      summary([walletable({ id: 20, name: "Card", type: "credit_card", limited: true })]),
    ]);
    const sync = createWalletableSync({ client, dryRun: true });

    await expect(sync({ kind: "one", walletableId: 20 })).resolves.toEqual({
      dryRun: true,
      walletables: [
        {
          walletableId: 20,
          walletableName: "Card",
          walletableType: "credit_card",
          status: "would-request",
        },
      ],
    });
    expect(requests).toEqual([{ method: "GET", path: "/api/p/v2/walletables/summary" }]);
  });

  test("previews only eligible bulk walletables without starting synchronization", async () => {
    const { client, requests } = scriptedClient([
      summary([
        walletable({ id: 10, name: "Bank", type: "bank_account" }),
        walletable({ id: 20, name: "Disconnected", type: "credit_card", connected: false }),
        walletable({ id: 30, name: "Limited", type: "credit_card", limited: true }),
      ]),
    ]);
    const sync = createWalletableSync({ client, dryRun: true });

    await expect(sync({ kind: "all" })).resolves.toEqual({
      dryRun: true,
      walletables: [
        {
          walletableId: 10,
          walletableName: "Bank",
          walletableType: "bank_account",
          status: "would-request",
        },
      ],
    });
    expect(requests).toEqual([{ method: "GET", path: "/api/p/v2/walletables/summary" }]);
  });

  test("resolves the walletable type and confirms one sync completed", async () => {
    const progress: WalletableSyncProgress[] = [];
    const { client, requests } = scriptedClient([
      summary([walletable({ id: 20, name: "Card", type: "credit_card" })]),
      {},
      {
        walletable_status: "syncing",
        last_synced_at: "2026-08-24T01:05:00.000Z",
        sync_failed_reason: null,
      },
      {
        walletable_status: "syncing",
        last_synced_at: "2026-08-24T01:05:00.000Z",
        sync_failed_reason: null,
      },
      {
        walletable_status: "synced",
        last_synced_at: "2026-08-24T01:10:00.000Z",
        sync_failed_reason: null,
      },
    ]);
    const sync = createWalletableSync({
      client,
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
      { method: "GET", path: "/api/p/v2/walletables/summary" },
      { method: "PUT", path: "/api/p/v2/walletables/credit_card/20/sync" },
      { method: "GET", path: "/api/p/v2/walletables/credit_card/20/sync_status" },
      { method: "GET", path: "/api/p/v2/walletables/credit_card/20/sync_status" },
      { method: "GET", path: "/api/p/v2/walletables/credit_card/20/sync_status" },
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
    const { client, requests } = scriptedClient([
      summary([bank, card, disconnected, limited, skipped]),
      {},
      summary([
        { ...bank, last_synced_at: "2026-08-24T01:05:00.000Z" },
        { ...card, last_synced_at: "2026-08-24T01:05:01.000Z" },
        disconnected,
        limited,
        skipped,
      ]),
    ]);
    const sync = createWalletableSync({
      client,
      polling: immediatePolling(),
      onProgress: (event) => progress.push(event),
    });

    const result = await sync({ kind: "all" });

    expect(result.walletables.map(({ walletableId }) => walletableId)).toEqual([10, 20]);
    expect(requests).toEqual([
      { method: "GET", path: "/api/p/v2/walletables/summary" },
      { method: "PUT", path: "/api/p/v2/walletables/sync_all" },
      { method: "GET", path: "/api/p/v2/walletables/summary" },
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
      const { client, requests } = scriptedClient([
        summary([walletable({ id: 10, name: "Bank", type: "bank_account" })], options),
      ]);
      const sync = createWalletableSync({ client, polling: immediatePolling() });

      await expect(sync({ kind: "all" })).rejects.toThrow("freee");
      expect(requests.filter(({ method }) => method === "PUT")).toHaveLength(0);
    }
  });

  test("reports observed failures", async () => {
    const card = walletable({ id: 20, name: "Card", type: "credit_card" });
    const { client } = scriptedClient([
      summary([card]),
      {},
      {
        walletable_status: "failed",
        last_synced_at: card.last_synced_at,
        sync_failed_reason: "provider unavailable",
      },
    ]);
    const sync = createWalletableSync({ client, polling: immediatePolling() });

    await expect(sync({ kind: "one", walletableId: 20 })).rejects.toThrow("provider unavailable");
  });

  test("does not mistake a retained previous failure for the current individual sync", async () => {
    const card = walletable({
      id: 20,
      name: "Card",
      type: "credit_card",
      failure: "old provider error",
    });
    const { client } = scriptedClient([
      summary([card]),
      {},
      {
        walletable_status: "syncing",
        last_synced_at: card.last_synced_at,
        sync_failed_reason: "old provider error",
      },
      {
        walletable_status: "synced",
        last_synced_at: "2026-08-24T01:05:00.000Z",
        sync_failed_reason: "old provider error",
      },
    ]);
    const sync = createWalletableSync({ client, polling: immediatePolling() });

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
    const { client } = scriptedClient([
      summary([card]),
      {},
      {
        walletable_status: "syncing",
        last_synced_at: card.last_synced_at,
        sync_failed_reason: "provider unavailable",
      },
      {
        walletable_status: "failed",
        last_synced_at: card.last_synced_at,
        sync_failed_reason: "provider unavailable",
      },
    ]);
    const sync = createWalletableSync({ client, polling: immediatePolling() });

    await expect(sync({ kind: "one", walletableId: 20 })).rejects.toThrow("provider unavailable");
  });

  test("reports a new failure from sync all", async () => {
    const card = walletable({ id: 20, name: "Card", type: "credit_card" });
    const { client } = scriptedClient([
      summary([card]),
      {},
      summary([
        { ...card, walletable_status: "failed", sync_failed_reason: "provider unavailable" },
      ]),
    ]);
    const sync = createWalletableSync({ client, polling: immediatePolling() });

    await expect(sync({ kind: "all" })).rejects.toThrow("provider unavailable");
  });

  test("reports the same failure after a walletable participated", async () => {
    const card = walletable({
      id: 20,
      name: "Card",
      type: "credit_card",
      failure: "provider unavailable",
    });
    const { client } = scriptedClient([
      summary([card]),
      {},
      summary([{ ...card, walletable_status: "syncing" }], { hasSyncing: true }),
      summary([{ ...card, walletable_status: "failed" }]),
    ]);
    let now = 0;
    const sync = createWalletableSync({
      client,
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
    const { client } = scriptedClient([
      summary([bank, skipped]),
      {},
      summary([{ ...bank, walletable_status: "syncing" }, skipped], { hasSyncing: true }),
    ]);
    const sync = createWalletableSync({
      client,
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
    const { client } = scriptedClient([summary([bank, card]), {}, summary([bank, card])]);
    const sync = createWalletableSync({
      client,
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
    const { client, requests } = scriptedClient([
      summary([card]),
      {},
      new Error("status request failed"),
    ]);
    const sync = createWalletableSync({ client, polling: immediatePolling() });

    const result = sync({ kind: "one", walletableId: 20 });

    await expect(result).rejects.toBeInstanceOf(OutcomeUnknownError);
    await expect(result).rejects.toMatchObject({ code: "OUTCOME_UNKNOWN" });
    expect(requests.filter(({ method }) => method === "PUT")).toHaveLength(1);
  });

  test("does not treat an unchanged timestamp as completion", async () => {
    const initial = walletable({ id: 20, name: "Card", type: "credit_card" });
    const { client, requests } = scriptedClient([
      summary([initial]),
      {},
      {
        walletable_status: "synced",
        last_synced_at: initial.last_synced_at,
        sync_failed_reason: null,
      },
      {
        walletable_status: "synced",
        last_synced_at: initial.last_synced_at,
        sync_failed_reason: null,
      },
    ]);
    const sync = createWalletableSync({
      client,
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
    expect(requests.filter(({ method }) => method === "PUT")).toHaveLength(1);
  });

  test("fails closed when the summary schema changes", async () => {
    const { client, requests } = scriptedClient([
      { walletables: [{ walletable_id: 20, name: "Card" }], summary: {} },
    ]);
    const sync = createWalletableSync({ client, polling: immediatePolling() });

    await expect(sync({ kind: "one", walletableId: 20 })).rejects.toThrow("observed schema");
    expect(requests).toHaveLength(1);
  });
});
