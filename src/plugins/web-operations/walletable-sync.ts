import * as v from "valibot";

import { OutcomeUnknownError } from "../../errors.ts";
import type { FreeeWebClient } from "./freee-web-client.ts";

const PositiveIntegerSchema = v.pipe(v.number(), v.integer(), v.minValue(1));
const NonEmptyStringSchema = v.pipe(v.string(), v.trim(), v.minLength(1));
const TimestampSchema = v.pipe(v.string(), v.isoTimestamp());
const WalletableTypeSchema = v.picklist(["bank_account", "credit_card", "wallet"]);

const WalletableSyncStateSchema = v.object({
  walletable_status: NonEmptyStringSchema,
  last_synced_at: v.nullable(TimestampSchema),
  sync_failed_reason: v.nullable(NonEmptyStringSchema),
});

const WalletableSummaryItemSchema = v.object({
  walletable_id: PositiveIntegerSchema,
  name: NonEmptyStringSchema,
  walletable_type: WalletableTypeSchema,
  walletable_status: NonEmptyStringSchema,
  last_synced_at: v.nullable(TimestampSchema),
  connected_service_id: v.nullable(PositiveIntegerSchema),
  is_sync_frequency_limited: v.nullable(v.boolean()),
  sync_failed_reason: v.nullable(NonEmptyStringSchema),
});

const WalletableSummarySchema = v.object({
  walletables: v.array(WalletableSummaryItemSchema),
  summary: v.object({
    has_syncing: v.boolean(),
    available_sync_all: v.boolean(),
    ready_to_sync_all: v.boolean(),
  }),
});

const SyncStartedSchema = v.object({});

export type WalletableSyncScope = { kind: "all" } | { kind: "one"; walletableId: number };

export type WalletableSyncProgress =
  | { kind: "bulk"; status: "started" }
  | {
      kind: "walletable";
      walletableId: number;
      walletableName: string;
      walletableType: v.InferOutput<typeof WalletableTypeSchema>;
      status: "started" | "syncing" | "synced";
    };

export type WalletableSyncResult =
  | {
      walletables: Array<{
        walletableId: number;
        walletableName: string;
        walletableType: v.InferOutput<typeof WalletableTypeSchema>;
        status: "synced";
        lastSyncedAt: string;
      }>;
    }
  | {
      dryRun: true;
      walletables: Array<{
        walletableId: number;
        walletableName: string;
        walletableType: v.InferOutput<typeof WalletableTypeSchema>;
        status: "would-request";
      }>;
    };

type Polling = {
  timeoutMs: number;
  pollIntervalMs: number;
  now: () => number;
  sleep: (milliseconds: number) => Promise<void>;
};

const defaultPolling: Polling = {
  timeoutMs: 60 * 60_000,
  pollIntervalMs: 10_000,
  now: Date.now,
  sleep: Bun.sleep,
};

function completedAfter(before: string | null, after: string | null): after is string {
  return after !== null && (before === null || Date.parse(after) > Date.parse(before));
}

function failure(name: string, reason: string): Error {
  return new Error(`freee walletable sync failed: ${name} (${reason})`);
}

function timeout(names: string[]): OutcomeUnknownError {
  return new OutcomeUnknownError(
    `freee walletable sync started, but completion was not confirmed: ${names.join(", ")}`,
  );
}

async function observeAfterStart<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof OutcomeUnknownError) throw error;
    throw new OutcomeUnknownError(
      "freee walletable sync started, but its current status could not be confirmed.",
      { cause: error },
    );
  }
}

export function createWalletableSync(input: {
  client: FreeeWebClient;
  dryRun?: boolean;
  polling?: Polling;
  onProgress?: (progress: WalletableSyncProgress) => void;
}): (scope: WalletableSyncScope) => Promise<WalletableSyncResult> {
  const polling = input.polling ?? defaultPolling;

  return async (scope) => {
    const reportedStatuses = new Map<number, "started" | "syncing" | "synced">();
    const reportWalletable = (
      walletable: v.InferOutput<typeof WalletableSummaryItemSchema>,
      status: "started" | "syncing" | "synced",
    ) => {
      if (reportedStatuses.get(walletable.walletable_id) === status) return;
      reportedStatuses.set(walletable.walletable_id, status);
      input.onProgress?.({
        kind: "walletable",
        walletableId: walletable.walletable_id,
        walletableName: walletable.name,
        walletableType: walletable.walletable_type,
        status,
      });
    };
    const initial = await input.client.request(
      { method: "GET", path: "/api/p/v2/walletables/summary" },
      WalletableSummarySchema,
    );
    const deadline = polling.now() + polling.timeoutMs;

    if (scope.kind === "one") {
      const target = initial.walletables.find(({ walletable_id: id }) => id === scope.walletableId);
      if (!target) throw new Error(`Walletable ${scope.walletableId} was not found in freee.`);
      if (target.connected_service_id === null) {
        throw new Error(`${target.name} is not connected to a sync service.`);
      }
      if (input.dryRun) {
        return {
          dryRun: true,
          walletables: [
            {
              walletableId: target.walletable_id,
              walletableName: target.name,
              walletableType: target.walletable_type,
              status: "would-request",
            },
          ],
        };
      }

      await input.client.request(
        {
          method: "PUT",
          path: `/api/p/v2/walletables/${target.walletable_type}/${target.walletable_id}/sync`,
        },
        SyncStartedSchema,
      );
      reportWalletable(target, "started");

      let participating = false;
      while (true) {
        const current = await observeAfterStart(() =>
          input.client.request(
            {
              method: "GET",
              path: `/api/p/v2/walletables/${target.walletable_type}/${target.walletable_id}/sync_status`,
            },
            WalletableSyncStateSchema,
          ),
        );
        if (
          current.walletable_status === "synced" &&
          completedAfter(target.last_synced_at, current.last_synced_at)
        ) {
          reportWalletable(target, "synced");
          return {
            walletables: [
              {
                walletableId: target.walletable_id,
                walletableName: target.name,
                walletableType: target.walletable_type,
                status: "synced",
                lastSyncedAt: current.last_synced_at,
              },
            ],
          };
        }
        const wasParticipating = participating;
        if (current.walletable_status === "syncing") {
          participating = true;
          reportWalletable(target, "syncing");
        }
        const reason = current.sync_failed_reason;
        const newlyFailed = reason !== null && reason !== target.sync_failed_reason;
        if (
          reason &&
          (newlyFailed ||
            (wasParticipating &&
              current.walletable_status !== "syncing" &&
              current.walletable_status !== "synced"))
        ) {
          throw failure(target.name, reason);
        }
        if (polling.now() >= deadline) throw timeout([target.name]);
        await observeAfterStart(() => polling.sleep(polling.pollIntervalMs));
      }
    }

    if (!initial.summary.available_sync_all) {
      throw new Error("freee does not currently allow syncing all walletables.");
    }
    if (!initial.summary.ready_to_sync_all) {
      throw new Error("freee is not ready to start syncing all walletables.");
    }
    const targets = initial.walletables.filter(
      (walletable) =>
        walletable.connected_service_id !== null && walletable.is_sync_frequency_limited !== true,
    );
    if (targets.length === 0) throw new Error("No connected walletables can be synced.");
    if (input.dryRun) {
      return {
        dryRun: true,
        walletables: targets.map((target) => ({
          walletableId: target.walletable_id,
          walletableName: target.name,
          walletableType: target.walletable_type,
          status: "would-request" as const,
        })),
      };
    }

    await input.client.request(
      { method: "PUT", path: "/api/p/v2/walletables/sync_all" },
      SyncStartedSchema,
    );
    input.onProgress?.({ kind: "bulk", status: "started" });

    const participatingIds = new Set<number>();
    while (true) {
      const current = await observeAfterStart(() =>
        input.client.request(
          { method: "GET", path: "/api/p/v2/walletables/summary" },
          WalletableSummarySchema,
        ),
      );
      const states = new Map(
        current.walletables.map((walletable) => [walletable.walletable_id, walletable]),
      );
      for (const target of targets) {
        const state = states.get(target.walletable_id);
        const reason = state?.sync_failed_reason;
        const wasParticipating = participatingIds.has(target.walletable_id);
        const newlyFailed =
          reason !== null && reason !== undefined && reason !== target.sync_failed_reason;
        const completed = completedAfter(target.last_synced_at, state?.last_synced_at ?? null);
        if (state?.walletable_status === "syncing" || completed || newlyFailed) {
          participatingIds.add(target.walletable_id);
        }
        if (state?.walletable_status === "syncing") reportWalletable(target, "syncing");
        if (state?.walletable_status === "synced" && completed) {
          reportWalletable(target, "synced");
        }
        if (
          reason &&
          (newlyFailed ||
            (wasParticipating &&
              state.walletable_status !== "syncing" &&
              state.walletable_status !== "synced"))
        ) {
          throw failure(target.name, reason);
        }
      }

      const completed = targets.flatMap((target) => {
        if (!participatingIds.has(target.walletable_id)) return [];
        const state = states.get(target.walletable_id);
        if (
          state?.walletable_status !== "synced" ||
          !completedAfter(target.last_synced_at, state.last_synced_at)
        ) {
          return [];
        }
        return [
          {
            walletableId: target.walletable_id,
            walletableName: target.name,
            walletableType: target.walletable_type,
            status: "synced" as const,
            lastSyncedAt: state.last_synced_at,
          },
        ];
      });
      if (
        !current.summary.has_syncing &&
        participatingIds.size > 0 &&
        completed.length === participatingIds.size
      ) {
        return { walletables: completed };
      }
      if (polling.now() >= deadline) {
        const completedIds = new Set(completed.map(({ walletableId }) => walletableId));
        const expected =
          participatingIds.size === 0
            ? targets
            : targets.filter(({ walletable_id: id }) => participatingIds.has(id));
        throw timeout(
          expected.filter(({ walletable_id: id }) => !completedIds.has(id)).map(({ name }) => name),
        );
      }
      await observeAfterStart(() => polling.sleep(polling.pollIntervalMs));
    }
  };
}
