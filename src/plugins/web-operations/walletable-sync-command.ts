import { PositiveIntegerTextSchema, parseCliInput } from "../../cli-input.ts";
import { configDir, loadConfig } from "../../config/config.ts";
import { CliError, ConfigError, errorHints } from "../../errors.ts";
import { resolveConfiguredProfile } from "../../profiles.ts";
import { createFreeeWebClient, type FreeeWebClient } from "./freee-web-client.ts";
import {
  createWalletableSync,
  type WalletableSyncProgress,
  type WalletableSyncResult,
  type WalletableSyncScope,
} from "./walletable-sync.ts";

type Values = {
  all?: boolean;
  "dry-run"?: boolean;
  format?: unknown;
  id?: unknown;
  profile?: unknown;
};

type Dependencies = {
  configDirectory: () => string;
  environment: Record<string, string | undefined>;
  loadConfiguration: typeof loadConfig;
  resolveProfile: (
    requested: unknown,
    directory: string,
    environment: string | undefined,
  ) => string;
  createClient: (input: {
    companyId: number;
    authProfile: string;
    environment: Record<string, string | undefined>;
  }) => FreeeWebClient;
  sync: (
    client: FreeeWebClient,
    scope: WalletableSyncScope,
    onProgress: (progress: WalletableSyncProgress) => void,
    dryRun: boolean,
  ) => Promise<WalletableSyncResult>;
  writeProgress: (message: string) => void;
};

const defaultDependencies: Dependencies = {
  configDirectory: configDir,
  environment: process.env,
  loadConfiguration: loadConfig,
  resolveProfile: resolveConfiguredProfile,
  createClient: createFreeeWebClient,
  sync: (client, scope, onProgress, dryRun) =>
    createWalletableSync({ client, dryRun, onProgress })(scope),
  writeProgress: (message) => process.stderr.write(`${message}\n`),
};

function formatProgress(progress: WalletableSyncProgress): string {
  if (progress.kind === "bulk") return "freee Web bulk sync: started";
  return `${progress.walletableName}: ${progress.status}`;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function syncScope(values: Values): WalletableSyncScope {
  const hasAll = values.all === true;
  const hasId = values.id !== undefined;
  if (hasAll === hasId) {
    throw new CliError("Pass exactly one of --all or --id.", {
      code: "INVALID_INPUT",
      hint: errorHints.oneIdentifier,
    });
  }
  if (hasAll) return { kind: "all" };
  return {
    kind: "one",
    walletableId: parseCliInput(PositiveIntegerTextSchema, values.id, { label: "--id" }),
  };
}

export async function runWalletableSyncCommand(
  values: Values,
  dependencies: Partial<Dependencies> = {},
) {
  const deps = { ...defaultDependencies, ...dependencies };
  const scope = syncScope(values);
  const directory = deps.configDirectory();
  const profile = deps.resolveProfile(values.profile, directory, deps.environment.FREEE_PROFILE);
  const configuredProfile = deps.loadConfiguration(directory).profiles[profile];
  if (!configuredProfile) {
    throw new ConfigError(`Profile "${profile}" has no configured freee company.`);
  }
  const web = configuredProfile.experimental?.web;
  if (!web) {
    throw new ConfigError(
      `Experimental freee Web operations are not enabled for profile "${profile}".`,
      {
        hint: `Run "freee setup" in an interactive terminal and enable Web operations for profile "${profile}".`,
      },
    );
  }

  const client = deps.createClient({
    companyId: configuredProfile.companyId,
    authProfile: web.authProfile,
    environment: deps.environment,
  });
  const onProgress =
    values.format === "json"
      ? () => undefined
      : (progress: WalletableSyncProgress) => deps.writeProgress(formatProgress(progress));
  let result: WalletableSyncResult;
  try {
    result = await deps.sync(client, scope, onProgress, values["dry-run"] === true);
  } catch (error) {
    await client.close().catch(() => undefined);
    throw error;
  }
  try {
    await client.close();
  } catch (error) {
    deps.writeProgress(`Agent Browser session was not closed: ${errorMessage(error)}`);
  }
  return {
    profile,
    companyId: configuredProfile.companyId,
    scope,
    ...result,
  };
}
