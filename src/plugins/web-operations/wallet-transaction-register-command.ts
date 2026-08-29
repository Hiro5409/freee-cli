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
  "account-item-name": string;
  description?: string;
  "dry-run"?: boolean;
  id?: unknown;
  profile?: unknown;
  "tax-name": string;
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
    why: "Deal registration requires one unchanged, unprocessed wallet transaction.",
    hint: 'Use "freee wallet-txn-list --status unreconciled --format json" and retry with an unchanged ID.',
  });
}

function registeredDealId(input: {
  walletTransaction: FreeeWebWalletTransaction;
  walletTransactionId: number;
  companyId: number;
}): number {
  const { walletTransaction, walletTransactionId, companyId } = input;
  const [dealId] = walletTransaction.dealIds;
  if (
    walletTransaction.id !== walletTransactionId ||
    walletTransaction.companyId !== companyId ||
    walletTransaction.status !== 2 ||
    walletTransaction.dealIds.length !== 1 ||
    dealId === undefined
  ) {
    throw new Error("freee Web does not report the wallet transaction as a registered Deal.");
  }
  return dealId;
}

export async function runWalletTransactionRegisterCommand(
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
    const line = {
      accountItemName: values["account-item-name"],
      taxName: values["tax-name"],
      amount: target.amount,
      description: values.description ?? target.description,
    };
    const registration = {
      walletTransaction,
      lines: [
        {
          accountItemName: line.accountItemName,
          taxName: line.taxName,
          amount: line.amount,
          description: line.description,
        },
      ],
    };
    const result = {
      profile: scope.profile,
      companyId: scope.companyId,
      action: "register" as const,
      target,
      line,
    };

    if (values["dry-run"] === true) {
      return {
        ...result,
        dryRun: true as const,
        preview: await web.previewWalletTransactionRegistration(registration),
      };
    }

    let writeError: OutcomeUnknownError | undefined;
    try {
      await web.registerWalletTransaction(registration);
    } catch (error) {
      if (!(error instanceof OutcomeUnknownError)) throw error;
      writeError = error;
    }

    try {
      const dealId = registeredDealId({
        walletTransaction: await web.walletTransaction(walletTransactionId),
        walletTransactionId,
        companyId: scope.companyId,
      });
      return { ...result, registered: true as const, dealId };
    } catch (verificationError) {
      throw new OutcomeUnknownError(
        "freee wallet transaction Deal registration could not be verified.",
        {
          cause: writeError
            ? new AggregateError(
                [writeError, verificationError],
                "Wallet transaction Deal registration verification failed.",
              )
            : verificationError,
        },
      );
    }
  });
}
