import { type FreeeWebOperations, withFreeeWeb } from "./freee-web.ts";
import { resolveWebCommandScope, type WebCommandScope } from "./web-command-scope.ts";

type Values = {
  "dry-run"?: boolean;
  profile?: unknown;
};

type Dependencies = {
  resolveScope: (requestedProfile: unknown) => WebCommandScope;
  withWeb: typeof withFreeeWeb;
};

const defaultDependencies: Dependencies = {
  resolveScope: resolveWebCommandScope,
  withWeb: withFreeeWeb,
};

export async function runWalletTransactionApplyRulesCommand(
  values: Values,
  dependencies: Partial<Dependencies> = {},
) {
  const deps = { ...defaultDependencies, ...dependencies };
  const scope = deps.resolveScope(values.profile);

  return deps.withWeb(scope, async (web: FreeeWebOperations) => {
    const match = await web.autoRegistrationRuleMatchCount();
    const result = {
      profile: scope.profile,
      companyId: scope.companyId,
      action: "apply-rules" as const,
      ...match,
    };

    if (values["dry-run"]) return { ...result, dryRun: true as const };

    const walletTransactionIds =
      match.matchCount === 0 ? [] : (await web.applyAutoRegistrationRules()).walletTransactionIds;
    return {
      ...result,
      appliedCount: walletTransactionIds.length,
      walletTransactionIds,
    };
  });
}
