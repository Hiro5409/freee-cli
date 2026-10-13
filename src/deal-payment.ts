import type { ArgValues } from "gunshi";
import { args, choice, integer, required } from "gunshi/combinators";

import { isoDateArg } from "./cli-input.ts";
import type { PaymentParams } from "./types/freee/types.gen.ts";

const WALLET_TYPES = ["bank_account", "credit_card", "wallet", "private_account_item"] as const;

export const dealPaymentArgs = args({
  date: required(isoDateArg("--date", "Payment date (YYYY-MM-DD)")),
  amount: required(
    integer({ min: 1, max: Number.MAX_SAFE_INTEGER, description: "Payment amount (integer yen)" }),
  ),
  "walletable-type": required(
    choice(WALLET_TYPES, { description: `Walletable type: ${WALLET_TYPES.join(" | ")}` }),
  ),
  "walletable-id": required(
    integer({
      min: 1,
      max: Number.MAX_SAFE_INTEGER,
      description: "Walletable ID, or account item ID for private_account_item",
    }),
  ),
});

export function dealPaymentParams(
  values: ArgValues<typeof dealPaymentArgs>,
  companyId: number,
): PaymentParams {
  return {
    company_id: companyId,
    date: values.date,
    amount: values.amount,
    from_walletable_type: values["walletable-type"],
    from_walletable_id: values["walletable-id"],
  };
}
