import { define } from "gunshi";
import { args, integer, merge, required } from "gunshi/combinators";

import { dealPaymentArgs, dealPaymentParams } from "../../deal-payment.ts";
import { companyArgs } from "../../global-args.ts";
import { initCommand } from "../../helpers.ts";
import { createDealPayment } from "../../types/freee/sdk.gen.ts";

export const dealPaymentCreateCommand = define({
  name: "create",
  description: "Add a payment to an existing deal",
  args: merge(
    companyArgs,
    args({
      id: required(integer({ min: 1, max: Number.MAX_SAFE_INTEGER, description: "Deal ID" })),
    }),
    dealPaymentArgs,
  ),
  examples: `$ freee deal payment create --id 42 --date 2026-08-15 --amount 5000 \\
    --walletable-type bank_account --walletable-id 9`,
  run: async (ctx) => {
    const { companyId } = initCommand(ctx);
    const id = ctx.values.id;
    const body = dealPaymentParams(ctx.values, companyId);
    const { data } = await createDealPayment({ path: { id }, body });
    return JSON.stringify(data.deal);
  },
});
