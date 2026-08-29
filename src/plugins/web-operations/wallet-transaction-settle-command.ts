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
  amount?: unknown;
  "deal-id"?: unknown;
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
    why: "Settlement requires one unchanged, unprocessed wallet transaction.",
    hint: 'Use "freee wallet-txn-list --status unreconciled --format json" and retry with an unchanged ID.',
  });
}

function assertSettled(input: {
  walletTransaction: FreeeWebWalletTransaction;
  walletTransactionId: number;
  companyId: number;
  dealId: number;
}): void {
  const { walletTransaction, walletTransactionId, companyId, dealId } = input;
  if (
    walletTransaction.id !== walletTransactionId ||
    walletTransaction.companyId !== companyId ||
    walletTransaction.status !== 2 ||
    !walletTransaction.dealIds.includes(dealId)
  ) {
    throw new Error("freee Web does not report the wallet transaction as settled.");
  }
}

export async function runWalletTransactionSettleCommand(
  values: Values,
  dependencies: Partial<Dependencies> = {},
) {
  const deps = { ...defaultDependencies, ...dependencies };
  const walletTransactionId = parseCliInput(PositiveIntegerTextSchema, values.id, {
    label: "--id",
  });
  const dealId = parseCliInput(PositiveIntegerTextSchema, values["deal-id"], {
    label: "--deal-id",
  });
  const amount = parseCliInput(PositiveIntegerTextSchema, values.amount, {
    label: "--amount",
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
    const settlement = { walletTransaction, dealId, amount };
    const result = {
      profile: scope.profile,
      companyId: scope.companyId,
      action: "settle" as const,
      target,
      dealId,
      amount,
    };

    if (values["dry-run"] === true) {
      return {
        ...result,
        dryRun: true as const,
        preview: await web.previewWalletTransactionSettlement(settlement),
      };
    }

    try {
      await web.settleWalletTransaction(settlement);
    } catch (error) {
      if (!(error instanceof OutcomeUnknownError)) throw error;
      try {
        assertSettled({
          walletTransaction: await web.walletTransaction(walletTransactionId),
          walletTransactionId,
          companyId: scope.companyId,
          dealId,
        });
      } catch (verificationError) {
        throw new OutcomeUnknownError(
          "freee wallet transaction settlement could not be verified.",
          {
            cause: new AggregateError(
              [error, verificationError],
              "Wallet transaction settlement verification failed.",
            ),
          },
        );
      }
    }

    return { ...result, settled: true as const };
  });
}
