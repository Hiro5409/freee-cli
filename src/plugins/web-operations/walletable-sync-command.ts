import { CliError, errorHints } from "../../errors.ts";
import { type FreeeWebOperations, withFreeeWeb } from "./freee-web.ts";
import {
  createWalletableSync,
  type WalletableSyncProgress,
  type WalletableSyncResult,
  type WalletableSyncScope,
  type WalletableSyncWeb,
} from "./walletable-sync.ts";
import { resolveWebCommandScope, type WebCommandScope } from "./web-command-scope.ts";

type Values = {
  all?: boolean;
  format?: unknown;
  id?: number;
  profile?: unknown;
};

type Dependencies = {
  resolveScope: (requestedProfile: unknown) => WebCommandScope;
  withWeb: typeof withFreeeWeb;
  sync: (
    web: WalletableSyncWeb,
    scope: WalletableSyncScope,
    onProgress: (progress: WalletableSyncProgress) => void,
  ) => Promise<WalletableSyncResult>;
  writeProgress: (message: string) => void;
};

const defaultDependencies: Dependencies = {
  resolveScope: resolveWebCommandScope,
  withWeb: withFreeeWeb,
  sync: (web, scope, onProgress) => createWalletableSync({ web, onProgress })(scope),
  writeProgress: (message) => process.stderr.write(`${message}\n`),
};

function formatProgress(progress: WalletableSyncProgress): string {
  if (progress.kind === "bulk") return "freee Web bulk sync: started";
  return `${progress.walletableName}: ${progress.status}`;
}

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
  const onProgress =
    values.format === "json"
      ? () => undefined
      : (progress: WalletableSyncProgress) => deps.writeProgress(formatProgress(progress));
  return deps.withWeb(commandScope, async (web: FreeeWebOperations) => {
    const result: WalletableSyncResult = await deps.sync(web, requestedSync, onProgress);
    return {
      profile: commandScope.profile,
      companyId: commandScope.companyId,
      scope: requestedSync,
      ...result,
    };
  });
}
