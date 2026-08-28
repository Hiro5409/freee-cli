import { describe, expect, test } from "bun:test";

import { CliError, ConfigError } from "../../errors.ts";
import type { FreeeWebClient } from "./freee-web-client.ts";
import { runWalletableSyncCommand } from "./walletable-sync-command.ts";
import type { WalletableSyncProgress } from "./walletable-sync.ts";

const client = { close: async () => {} } as FreeeWebClient;

function dependencies(input?: { client?: FreeeWebClient; web?: boolean }) {
  return {
    configDirectory: () => "/config",
    environment: { FREEE_PROFILE: "environment-profile" },
    resolveProfile: (requested: unknown, directory: string, environment: string | undefined) => {
      expect(requested).toBe("business");
      expect(directory).toBe("/config");
      expect(environment).toBe("environment-profile");
      return "business";
    },
    loadConfiguration: () => ({
      activeProfile: "business",
      defaults: { format: "table" },
      profiles: {
        business: {
          companyId: 42,
          name: "Business",
          experimental:
            input?.web === false ? undefined : { web: { authProfile: "business-freee" } },
        },
      },
    }),
    createClient: (options: {
      companyId: number;
      authProfile: string;
      environment: Record<string, string | undefined>;
    }) => {
      expect(options).toEqual({
        companyId: 42,
        authProfile: "business-freee",
        environment: { FREEE_PROFILE: "environment-profile" },
      });
      return input?.client ?? client;
    },
    sync: async (
      received: FreeeWebClient,
      scope: { kind: "all" } | { kind: "one"; walletableId: number },
    ) => {
      expect(received).toBe(input?.client ?? client);
      expect(scope).toEqual({ kind: "one", walletableId: 20 });
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
    let closed = 0;
    const scopedClient = {
      ...client,
      close: async () => {
        closed += 1;
      },
    };
    await expect(
      runWalletableSyncCommand(
        { profile: "business", id: "20" },
        dependencies({ client: scopedClient }),
      ),
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
    expect(closed).toBe(1);
  });

  test("preserves a synchronization error when closing also fails", async () => {
    let closed = 0;
    const synchronizationError = new Error("synchronization failed");
    const deps = {
      ...dependencies({
        client: {
          ...client,
          close: async () => {
            closed += 1;
            throw new Error("close failed");
          },
        },
      }),
      sync: async () => {
        throw synchronizationError;
      },
    };

    const error = await runWalletableSyncCommand({ profile: "business", all: true }, deps).catch(
      (caught: unknown) => caught,
    );

    expect(error).toBe(synchronizationError);
    expect(closed).toBe(1);
  });

  test("warns without failing when only browser cleanup fails", async () => {
    const messages: string[] = [];
    const deps = {
      ...dependencies({
        client: {
          ...client,
          close: async () => {
            throw new Error("close failed");
          },
        },
      }),
      writeProgress: (message: string) => messages.push(message),
    };

    await expect(
      runWalletableSyncCommand({ profile: "business", id: "20" }, deps),
    ).resolves.toMatchObject({ walletables: [{ walletableId: 20 }] });
    expect(messages).toEqual(["Agent Browser session was not closed: close failed"]);
  });

  test("writes progress separately from the final result", async () => {
    const messages: string[] = [];
    const deps = {
      ...dependencies(),
      writeProgress: (message: string) => messages.push(message),
      sync: async (
        _client: FreeeWebClient,
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
        _client: FreeeWebClient,
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

  test("passes dry-run through without changing the selected scope", async () => {
    let receivedDryRun: boolean | undefined;
    const deps = {
      ...dependencies(),
      sync: async (
        _client: FreeeWebClient,
        scope: { kind: "all" } | { kind: "one"; walletableId: number },
        _onProgress: (event: WalletableSyncProgress) => void,
        dryRun: boolean,
      ) => {
        expect(scope).toEqual({ kind: "all" });
        receivedDryRun = dryRun;
        return { dryRun: true as const, walletables: [] };
      },
    };

    await expect(
      runWalletableSyncCommand({ profile: "business", all: true, "dry-run": true }, deps),
    ).resolves.toMatchObject({ dryRun: true, walletables: [] });
    expect(receivedDryRun).toBe(true);
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

  test("fails before creating a browser session when the profile has not opted in", async () => {
    let created = false;
    const deps = {
      ...dependencies({ web: false }),
      createClient: () => {
        created = true;
        return client;
      },
    };

    const error = await runWalletableSyncCommand({ profile: "business", all: true }, deps).catch(
      (caught: unknown) => caught,
    );
    expect(error).toBeInstanceOf(ConfigError);
    expect(error).toMatchObject({
      exitCode: 3,
      hint: expect.stringContaining('Run "freee setup"'),
    });
    expect(created).toBe(false);
  });
});
