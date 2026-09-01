import { PositiveIntegerTextSchema, parseCliInput } from "../../cli-input.ts";
import { CliError, OutcomeUnknownError } from "../../errors.ts";
import {
  type FreeeWebOperations,
  type FreeeWebWalletTransaction,
  withFreeeWeb,
} from "./freee-web.ts";
import { identifyWalletTransactionTarget } from "./wallet-transaction-target.ts";
import { resolveWebCommandScope, type WebCommandScope } from "./web-command-scope.ts";

type Values = {
  id?: unknown;
  profile?: unknown;
};

type Dependencies = {
  resolveScope: (requestedProfile: unknown) => WebCommandScope;
  withWeb: typeof withFreeeWeb;
};

type Action = "ignore" | "restore";

const transitions = {
  ignore: {
    initialStatus: 1,
    finalStatus: 3,
    initialStatusName: "unprocessed",
    why: "Ignoring a wallet transaction requires one unchanged, unprocessed target.",
    hint: 'Use "freee wallet-txn-list --status unreconciled --format json" and retry with an unchanged ID.',
    write: (web: FreeeWebOperations, walletTransaction: FreeeWebWalletTransaction) =>
      web.ignoreWalletTransaction(walletTransaction),
  },
  restore: {
    initialStatus: 3,
    finalStatus: 1,
    initialStatusName: "ignored",
    why: "Restoring a wallet transaction requires one unchanged, ignored target.",
    hint: 'Use "freee wallet-txn-list --status ignored --format json" and retry with an unchanged ID.',
    write: (web: FreeeWebOperations, walletTransaction: FreeeWebWalletTransaction) =>
      web.restoreIgnoredWalletTransaction(walletTransaction),
  },
} as const;

const defaultDependencies: Dependencies = {
  resolveScope: resolveWebCommandScope,
  withWeb: withFreeeWeb,
};

function invalidTarget(action: Action, message: string): CliError {
  const transition = transitions[action];
  return new CliError(message, {
    code: "INVALID_INPUT",
    why: transition.why,
    hint: transition.hint,
  });
}

function identifyTarget(input: {
  action: Action;
  companyId: number;
  walletTransactionId: number;
  walletTransaction: FreeeWebWalletTransaction;
}) {
  const { action, companyId, walletTransactionId, walletTransaction } = input;
  const transition = transitions[action];
  const target = identifyWalletTransactionTarget(
    walletTransaction,
    { id: walletTransactionId, companyId },
    (message) => invalidTarget(action, message),
  );
  if (walletTransaction.status !== transition.initialStatus) {
    throw invalidTarget(
      action,
      `Wallet transaction ${walletTransaction.id} is not ${transition.initialStatusName}.`,
    );
  }
  if (action === "restore" && walletTransaction.recoveryLocked) {
    throw invalidTarget(
      action,
      `Wallet transaction ${walletTransaction.id} is locked from recovery by freee Web.`,
    );
  }

  return target;
}

function assertFinalState(input: {
  action: Action;
  companyId: number;
  walletTransactionId: number;
  walletTransaction: FreeeWebWalletTransaction;
}): void {
  const { action, companyId, walletTransactionId, walletTransaction } = input;
  if (
    walletTransaction.companyId !== companyId ||
    walletTransaction.id !== walletTransactionId ||
    walletTransaction.status !== transitions[action].finalStatus
  ) {
    throw new Error(
      `The wallet transaction is not reported as ${action === "ignore" ? "ignored" : "unprocessed"} by freee Web.`,
    );
  }
}

async function runWalletTransactionTransition(
  action: Action,
  values: Values,
  dependencies: Partial<Dependencies>,
) {
  const deps = { ...defaultDependencies, ...dependencies };
  const walletTransactionId = parseCliInput(PositiveIntegerTextSchema, values.id, {
    label: "--id",
  });
  const scope = deps.resolveScope(values.profile);

  return deps.withWeb(scope, async (web) => {
    const walletTransaction = await web.walletTransaction(walletTransactionId);
    const target = identifyTarget({
      action,
      companyId: scope.companyId,
      walletTransactionId,
      walletTransaction,
    });
    const result = { profile: scope.profile, companyId: scope.companyId, action, target };

    try {
      await transitions[action].write(web, walletTransaction);
    } catch (error) {
      if (!(error instanceof OutcomeUnknownError)) throw error;
      try {
        assertFinalState({
          action,
          companyId: scope.companyId,
          walletTransactionId,
          walletTransaction: await web.walletTransaction(walletTransactionId),
        });
      } catch (verificationError) {
        throw new OutcomeUnknownError(`freee wallet transaction ${action} could not be verified.`, {
          cause: new AggregateError(
            [error, verificationError],
            `Wallet transaction ${action} verification failed.`,
          ),
        });
      }
    }

    return action === "ignore"
      ? { ...result, ignored: true as const }
      : { ...result, restored: true as const };
  });
}

export function runWalletTransactionIgnoreCommand(
  values: Values,
  dependencies: Partial<Dependencies> = {},
) {
  return runWalletTransactionTransition("ignore", values, dependencies);
}

export function runWalletTransactionRestoreCommand(
  values: Values,
  dependencies: Partial<Dependencies> = {},
) {
  return runWalletTransactionTransition("restore", values, dependencies);
}
