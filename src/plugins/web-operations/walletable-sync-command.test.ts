import { describe, expect, test } from "bun:test";

import { CliError } from "../../errors.ts";
import type { FreeeWebOperations } from "./freee-web.ts";
import { runWalletableSyncCommand } from "./walletable-sync-command.ts";
import type { WalletableSyncProgress, WalletableSyncWeb } from "./walletable-sync.ts";

const scope = {
  profile: "business",
  companyId: 42,
  authProfile: "business-freee",
};
const web = {} as FreeeWebOperations;

function dependencies() {
  return {
    resolveScope: (requested: unknown) => {
      expect(requested).toBe("business");
      return scope;
    },
    withWeb: async <T>(
      receivedScope: { companyId: number; authProfile: string },
      run: (receivedWeb: FreeeWebOperations) => Promise<T>,
    ) => {
      expect(receivedScope).toEqual(scope);
      return run(web);
    },
    sync: async (
      received: WalletableSyncWeb,
      requestedSync: { kind: "all" } | { kind: "one"; walletableId: number },
    ) => {
      expect(received).toBe(web);
      expect(requestedSync).toEqual({ kind: "one", walletableId: 20 });
      return {
        walletables: [
          {
            walletableId: 20,
            walletableName: "Card",
            walletableType: "credit_card" as const,
            status: "synced" as const,
            lastSyncedAt: "2026-08-24T01:10:00.000Z",
          },
        ],
      };
    },
  };
}

describe("walletable sync command", () => {
  test("uses the OAuth profile company and its Agent Browser Auth Profile", async () => {
    await expect(
      runWalletableSyncCommand({ profile: "business", id: "20" }, dependencies()),
    ).resolves.toEqual({
      profile: "business",
      companyId: 42,
      scope: { kind: "one", walletableId: 20 },
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
  });

  test("writes progress separately from the final result", async () => {
    const messages: string[] = [];
    const deps = {
      ...dependencies(),
      writeProgress: (message: string) => messages.push(message),
      sync: async (
        _web: WalletableSyncWeb,
        _scope: { kind: "all" } | { kind: "one"; walletableId: number },
        onProgress: (event: WalletableSyncProgress) => void,
      ) => {
        onProgress({ kind: "bulk", status: "started" });
        onProgress({
          kind: "walletable",
          walletableId: 20,
          walletableName: "Card",
          walletableType: "credit_card",
          status: "syncing",
        });
        return { walletables: [] };
      },
    };

    await expect(
      runWalletableSyncCommand({ profile: "business", all: true }, deps),
    ).resolves.toMatchObject({ walletables: [] });
    expect(messages).toEqual(["freee Web bulk sync: started", "Card: syncing"]);
  });

  test("keeps JSON mode free of human-readable progress", async () => {
    const messages: string[] = [];
    const deps = {
      ...dependencies(),
      writeProgress: (message: string) => messages.push(message),
      sync: async (
        _web: WalletableSyncWeb,
        _scope: { kind: "all" } | { kind: "one"; walletableId: number },
        onProgress: (event: WalletableSyncProgress) => void,
      ) => {
        onProgress({ kind: "bulk", status: "started" });
        return { walletables: [] };
      },
    };

    await runWalletableSyncCommand({ profile: "business", all: true, format: "json" }, deps);

    expect(messages).toEqual([]);
  });

  test("requires exactly one synchronization scope", async () => {
    for (const values of [{ profile: "business" }, { profile: "business", all: true, id: "20" }]) {
      const error = await runWalletableSyncCommand(values, dependencies()).catch(
        (caught: unknown) => caught,
      );
      expect(error).toBeInstanceOf(CliError);
      expect(String(error)).toContain("exactly one");
    }
  });

  test("requires a positive walletable ID", async () => {
    await expect(
      runWalletableSyncCommand({ profile: "business", id: "0" }, dependencies()),
    ).rejects.toThrow("positive integer");
  });
});
