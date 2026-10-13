import { define } from "gunshi";
import { args, integer, merge, required } from "gunshi/combinators";
import colors from "yoctocolors";

import { dealPaymentArgs, dealPaymentParams } from "../../deal-payment.ts";
import { companyArgs } from "../../global-args.ts";
import { initCommand } from "../../helpers.ts";
import { formatValue } from "../../output/formatter.ts";
import { createDealPayment } from "../../types/freee/sdk.gen.ts";

export const dealPaymentCreateCommand = define({
  name: "deal-payment-create",
  description: "Add a payment to an existing deal",
  args: merge(
    companyArgs,
    args({
      id: required(integer({ min: 1, max: Number.MAX_SAFE_INTEGER, description: "Deal ID" })),
    }),
    dealPaymentArgs,
  ),
  examples: `$ freee deal-payment-create --id 42 --date 2026-08-15 --amount 5000 \\
    --walletable-type bank_account --walletable-id 9 --format json`,
  run: async (ctx) => {
    const { companyId, format } = initCommand(ctx);
    const id = ctx.values.id;
    const body = dealPaymentParams(ctx.values, companyId);
    const { data } = await createDealPayment({ path: { id }, body });
    return formatValue(
      data.deal,
      format,
      `${colors.green("Payment created:")} ${JSON.stringify(data.deal, null, 2)}`,
    );
  },
});
