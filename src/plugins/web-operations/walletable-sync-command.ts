import { CliError, errorHints } from "../../errors.ts";
import { type FreeeScope, resolveFreeeScope } from "../../profiles.ts";
import { type FreeeWebOperations, withFreeeWeb } from "./freee-web.ts";
import {
  createWalletableSync,
  type WalletableSyncResult,
  type WalletableSyncScope,
  type WalletableSyncWeb,
} from "./walletable-sync.ts";

type Values = {
  all?: boolean;
  id?: number;
  profile?: unknown;
};

type Dependencies = {
  resolveScope: (requestedProfile: unknown) => FreeeScope;
  withWeb: typeof withFreeeWeb;
  sync: (web: WalletableSyncWeb, scope: WalletableSyncScope) => Promise<WalletableSyncResult>;
};

const defaultDependencies: Dependencies = {
  resolveScope: resolveFreeeScope,
  withWeb: withFreeeWeb,
  sync: (web, scope) => createWalletableSync({ web })(scope),
};

function syncScope(values: Values): WalletableSyncScope {
  if (values.all === true) {
    if (values.id === undefined) return { kind: "all" };
    throw new CliError("Pass exactly one of --all or --id.", {
      code: "INVALID_INPUT",
      hint: errorHints.oneIdentifier,
    });
  }
  if (values.id !== undefined) return { kind: "one", walletableId: values.id };
  throw new CliError("Pass exactly one of --all or --id.", {
    code: "INVALID_INPUT",
    hint: errorHints.oneIdentifier,
  });
}

export async function runWalletableSyncCommand(
  values: Values,
  dependencies: Partial<Dependencies> = {},
) {
  const deps = { ...defaultDependencies, ...dependencies };
  const requestedSync = syncScope(values);
  const commandScope = deps.resolveScope(values.profile);
  return deps.withWeb(commandScope, async (web: FreeeWebOperations) => {
    const result: WalletableSyncResult = await deps.sync(web, requestedSync);
    return {
      profile: commandScope.profile,
      companyId: commandScope.companyId,
      scope: requestedSync,
      ...result,
    };
  });
}
