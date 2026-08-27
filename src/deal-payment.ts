import type { ArgValues } from "gunshi";

import {
  IntegerTextSchema,
  IsoDateSchema,
  PositiveIntegerTextSchema,
  parseCliInput,
} from "./cli-input.ts";
import { CliError, errorHints } from "./errors.ts";
import type { PaymentParams } from "./types/freee/types.gen.ts";

const WALLET_TYPES = ["bank_account", "credit_card", "wallet", "private_account_item"] as const;

export const dealPaymentArgs = {
  date: { type: "string" as const, description: "Payment date (YYYY-MM-DD)", required: true },
  amount: {
    type: "string" as const,
    description: "Payment amount (integer yen)",
    required: true,
  },
  "walletable-type": {
    type: "enum" as const,
    choices: WALLET_TYPES,
    description: `Walletable type: ${WALLET_TYPES.join(" | ")}`,
    required: true,
  },
  "walletable-id": {
    type: "string" as const,
    description: "Walletable ID, or account item ID for private_account_item",
    required: true,
  },
};

function parseAmount(value: unknown): number {
  const amount = parseCliInput(IntegerTextSchema, value, { label: "--amount" });
  if (amount > 0) return amount;
  throw new CliError(`--amount must be a positive integer, got "${value}"`, {
    code: "INVALID_INPUT",
    why: "A payment must reduce the outstanding balance by at least one yen.",
    hint: errorHints.invalidValue,
  });
}

export function parseDealPayment(
  values: ArgValues<typeof dealPaymentArgs>,
  companyId: number,
): PaymentParams {
  const walletableType = values["walletable-type"];
  if (walletableType === undefined) {
    throw new CliError("--walletable-type is required.", {
      code: "INVALID_INPUT",
      why: "A payment needs the account that supplied or received the funds.",
      hint: errorHints.invalidValue,
    });
  }

  return {
    company_id: companyId,
    date: parseCliInput(IsoDateSchema, values.date, { label: "--date" }),
    amount: parseAmount(values.amount),
    from_walletable_type: walletableType,
    from_walletable_id: parseCliInput(PositiveIntegerTextSchema, values["walletable-id"], {
      label: "--walletable-id",
    }),
  };
}
