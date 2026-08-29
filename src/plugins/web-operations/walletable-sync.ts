import { OutcomeUnknownError } from "../../errors.ts";
import type {
  FreeeWebOperations,
  FreeeWebWalletable,
  FreeeWebWalletableType,
} from "./freee-web.ts";

export type WalletableSyncWeb = Pick<
  FreeeWebOperations,
  "walletableSummary" | "startWalletableSync" | "walletableSyncState" | "startBulkWalletableSync"
>;

export type WalletableSyncScope = { kind: "all" } | { kind: "one"; walletableId: number };

export type WalletableSyncProgress =
  | { kind: "bulk"; status: "started" }
  | {
      kind: "walletable";
      walletableId: number;
      walletableName: string;
      walletableType: FreeeWebWalletableType;
      status: "started" | "syncing" | "synced";
    };

export type WalletableSyncResult =
  | {
      walletables: Array<{
        walletableId: number;
        walletableName: string;
        walletableType: FreeeWebWalletableType;
        status: "synced";
        lastSyncedAt: string;
      }>;
    }
  | {
      dryRun: true;
      walletables: Array<{
        walletableId: number;
        walletableName: string;
        walletableType: FreeeWebWalletableType;
        status: "would-request";
      }>;
    }
  | {
      dryRun: true;
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
  web: WalletableSyncWeb;
  dryRun?: boolean;
  polling?: Polling;
  onProgress?: (progress: WalletableSyncProgress) => void;
}): (scope: WalletableSyncScope) => Promise<WalletableSyncResult> {
  const polling = input.polling ?? defaultPolling;

  return async (scope) => {
    const reportedStatuses = new Map<number, "started" | "syncing" | "synced">();
    const reportWalletable = (
      walletable: FreeeWebWalletable,
      status: "started" | "syncing" | "synced",
    ) => {
      if (reportedStatuses.get(walletable.id) === status) return;
      reportedStatuses.set(walletable.id, status);
      input.onProgress?.({
        kind: "walletable",
        walletableId: walletable.id,
        walletableName: walletable.name,
        walletableType: walletable.type,
        status,
      });
    };
    const initial = await input.web.walletableSummary();
    const deadline = polling.now() + polling.timeoutMs;

    if (scope.kind === "one") {
      const target = initial.walletables.find(({ id }) => id === scope.walletableId);
      if (!target) throw new Error(`Walletable ${scope.walletableId} was not found in freee.`);
      if (target.connectedServiceId === null) {
        throw new Error(`${target.name} is not connected to a sync service.`);
      }
      if (input.dryRun) {
        return {
          dryRun: true,
          walletables: [
            {
              walletableId: target.id,
              walletableName: target.name,
              walletableType: target.type,
              status: "would-request",
            },
          ],
        };
      }

      await input.web.startWalletableSync(target.type, target.id);
      reportWalletable(target, "started");

      let participating = false;
      while (true) {
        const current = await observeAfterStart(() =>
          input.web.walletableSyncState(target.type, target.id),
        );
        if (
          current.status === "synced" &&
          completedAfter(target.lastSyncedAt, current.lastSyncedAt)
        ) {
          reportWalletable(target, "synced");
          return {
            walletables: [
              {
                walletableId: target.id,
                walletableName: target.name,
                walletableType: target.type,
                status: "synced",
                lastSyncedAt: current.lastSyncedAt,
              },
            ],
          };
        }
        const wasParticipating = participating;
        if (current.status === "syncing") {
          participating = true;
          reportWalletable(target, "syncing");
        }
        const reason = current.syncFailedReason;
        const newlyFailed = reason !== null && reason !== target.syncFailedReason;
        if (
          reason &&
          (newlyFailed ||
            (wasParticipating && current.status !== "syncing" && current.status !== "synced"))
        ) {
          throw failure(target.name, reason);
        }
        if (polling.now() >= deadline) throw timeout([target.name]);
        await observeAfterStart(() => polling.sleep(polling.pollIntervalMs));
      }
    }

    if (!initial.canSyncAll) {
      throw new Error("freee does not currently allow syncing all walletables.");
    }
    if (!initial.readyToSyncAll) {
      throw new Error("freee is not ready to start syncing all walletables.");
    }
    if (input.dryRun) {
      return { dryRun: true };
    }
    const targets = initial.walletables.filter(
      (walletable) =>
        walletable.connectedServiceId !== null && walletable.isSyncFrequencyLimited !== true,
    );
    if (targets.length === 0) throw new Error("No connected walletables can be synced.");

    await input.web.startBulkWalletableSync();
    input.onProgress?.({ kind: "bulk", status: "started" });

    const participatingIds = new Set<number>();
    while (true) {
      const current = await observeAfterStart(() => input.web.walletableSummary());
      const states = new Map(current.walletables.map((walletable) => [walletable.id, walletable]));
      for (const target of targets) {
        const state = states.get(target.id);
        const reason = state?.syncFailedReason;
        const wasParticipating = participatingIds.has(target.id);
        const newlyFailed =
          reason !== null && reason !== undefined && reason !== target.syncFailedReason;
        const completed = completedAfter(target.lastSyncedAt, state?.lastSyncedAt ?? null);
        if (state?.status === "syncing" || completed || newlyFailed) {
          participatingIds.add(target.id);
        }
        if (state?.status === "syncing") reportWalletable(target, "syncing");
        if (state?.status === "synced" && completed) {
          reportWalletable(target, "synced");
        }
        if (
          reason &&
          (newlyFailed ||
            (wasParticipating && state.status !== "syncing" && state.status !== "synced"))
        ) {
          throw failure(target.name, reason);
        }
      }

      const completed = targets.flatMap((target) => {
        if (!participatingIds.has(target.id)) return [];
        const state = states.get(target.id);
        if (
          state?.status !== "synced" ||
          !completedAfter(target.lastSyncedAt, state.lastSyncedAt)
        ) {
          return [];
        }
        return [
          {
            walletableId: target.id,
            walletableName: target.name,
            walletableType: target.type,
            status: "synced" as const,
            lastSyncedAt: state.lastSyncedAt,
          },
        ];
      });
      if (
        !current.hasSyncing &&
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
            : targets.filter(({ id }) => participatingIds.has(id));
        throw timeout(expected.filter(({ id }) => !completedIds.has(id)).map(({ name }) => name));
      }
      await observeAfterStart(() => polling.sleep(polling.pollIntervalMs));
    }
  };
}
