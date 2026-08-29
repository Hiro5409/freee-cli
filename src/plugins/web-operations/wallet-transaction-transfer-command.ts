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
  "counterparty-walletable-name": string;
  description?: string;
  "dry-run"?: boolean;
  id?: unknown;
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

function invalidTarget(message: string): CliError {
  return new CliError(message, {
    code: "INVALID_INPUT",
    why: "An account transfer requires one unchanged, unprocessed wallet transaction.",
    hint: 'Use "freee wallet-txn-list --status unreconciled --format json" and retry with an unchanged ID.',
  });
}

function assertTransferred(input: {
  walletTransaction: FreeeWebWalletTransaction;
  walletTransactionId: number;
  companyId: number;
}): void {
  const { walletTransaction, walletTransactionId, companyId } = input;
  if (
    walletTransaction.id !== walletTransactionId ||
    walletTransaction.companyId !== companyId ||
    walletTransaction.status !== 2 ||
    walletTransaction.transferIds.length === 0
  ) {
    throw new Error("freee Web does not report the wallet transaction as an account transfer.");
  }
}

export async function runWalletTransactionTransferCommand(
  values: Values,
  dependencies: Partial<Dependencies> = {},
) {
  const deps = { ...defaultDependencies, ...dependencies };
  const walletTransactionId = parseCliInput(PositiveIntegerTextSchema, values.id, {
    label: "--id",
  });
  const scope = deps.resolveScope(values.profile);

  return deps.withWeb(scope, async (web: FreeeWebOperations) => {
    const walletTransaction = await web.walletTransaction(walletTransactionId);
    const target = identifyWalletTransactionTarget(
      walletTransaction,
      { id: walletTransactionId, companyId: scope.companyId },
      invalidTarget,
    );
    if (walletTransaction.status !== 1) {
      throw invalidTarget(`Wallet transaction ${walletTransaction.id} is not unprocessed.`);
    }
    const transfer = {
      walletTransaction,
      counterpartyWalletableName: values["counterparty-walletable-name"],
      description: values.description ?? "",
    };
    const result = {
      profile: scope.profile,
      companyId: scope.companyId,
      action: "transfer" as const,
      target,
      counterpartyWalletableName: transfer.counterpartyWalletableName,
      description: transfer.description,
    };

    if (values["dry-run"] === true) {
      return {
        ...result,
        dryRun: true as const,
        preview: await web.previewWalletTransactionTransfer(transfer),
      };
    }

    try {
      await web.registerWalletTransactionTransfer(transfer);
    } catch (error) {
      if (!(error instanceof OutcomeUnknownError)) throw error;
      try {
        assertTransferred({
          walletTransaction: await web.walletTransaction(walletTransactionId),
          walletTransactionId,
          companyId: scope.companyId,
        });
      } catch (verificationError) {
        throw new OutcomeUnknownError("freee wallet transaction transfer could not be verified.", {
          cause: new AggregateError(
            [error, verificationError],
            "Wallet transaction transfer verification failed.",
          ),
        });
      }
    }

    return { ...result, transferred: true as const };
  });
}
