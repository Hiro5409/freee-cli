import { describe, expect, test } from "bun:test";

import type { FreeeWebOperations } from "./freee-web.ts";
import { runWalletTransactionApplyRulesCommand } from "./wallet-transaction-apply-rules-command.ts";

const scope = {
  profile: "business",
  companyId: 100,
  authProfile: "business-freee",
};

function dependencies(input: { matchCount: number; walletTransactionIds?: number[] }) {
  let writes = 0;
  const web = {
    autoRegistrationRuleMatchCount: async () => ({
      matchCount: input.matchCount,
      tooManyUnreconciledWalletTransactions: false,
    }),
    applyAutoRegistrationRules: async () => {
      writes += 1;
      return { walletTransactionIds: input.walletTransactionIds ?? [] };
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
    writes: () => writes,
  };
}

describe("wallet transaction auto-registration rules command", () => {
  test("dry-run reports freee's current match count without applying rules", async () => {
    const { deps, writes } = dependencies({ matchCount: 3 });

    await expect(
      runWalletTransactionApplyRulesCommand({ profile: "business", "dry-run": true }, deps),
    ).resolves.toEqual({
      profile: "business",
      companyId: 100,
      action: "apply-rules",
      matchCount: 3,
      tooManyUnreconciledWalletTransactions: false,
      dryRun: true,
    });
    expect(writes()).toBe(0);
  });

  test("applies freee's matching rules once and returns its selected transaction IDs", async () => {
    const { deps, writes } = dependencies({
      matchCount: 2,
      walletTransactionIds: [42, 43],
    });

    await expect(
      runWalletTransactionApplyRulesCommand({ profile: "business" }, deps),
    ).resolves.toEqual({
      profile: "business",
      companyId: 100,
      action: "apply-rules",
      matchCount: 2,
      tooManyUnreconciledWalletTransactions: false,
      appliedCount: 2,
      walletTransactionIds: [42, 43],
    });
    expect(writes()).toBe(1);
  });

  test("does not send a bulk write when freee reports no matches", async () => {
    const { deps, writes } = dependencies({ matchCount: 0 });

    await expect(
      runWalletTransactionApplyRulesCommand({ profile: "business" }, deps),
    ).resolves.toMatchObject({
      matchCount: 0,
      appliedCount: 0,
      walletTransactionIds: [],
    });
    expect(writes()).toBe(0);
  });
});
