import { CliError, errorHints } from "./errors.ts";
import { parseChoice, parseDate, parseInteger, parsePositiveId } from "./helpers.ts";
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
    type: "string" as const,
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
  const amount = parseInteger(value, "--amount");
  if (amount > 0) return amount;
  throw new CliError(`--amount must be a positive integer, got "${value}"`, {
    code: "INVALID_INPUT",
    why: "A payment must reduce the outstanding balance by at least one yen.",
    hint: errorHints.invalidValue,
  });
}

export function parseDealPayment(
  values: Record<string, unknown>,
  companyId: number,
): PaymentParams {
  return {
    company_id: companyId,
    date: parseDate(values.date, "--date"),
    amount: parseAmount(values.amount),
    from_walletable_type: parseChoice(values["walletable-type"], WALLET_TYPES, "--walletable-type"),
    from_walletable_id: parsePositiveId(values["walletable-id"], "--walletable-id"),
  };
}
