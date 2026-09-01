import { define } from "gunshi";
import colors from "yoctocolors";

import { PositiveIntegerTextSchema, parseCliInput } from "../../cli-input.ts";
import { dealPaymentArgs, parseDealPayment } from "../../deal-payment.ts";
import { companyArgs } from "../../global-args.ts";
import { initCommand } from "../../helpers.ts";
import { formatValue } from "../../output/formatter.ts";
import { createDealPayment } from "../../types/freee/sdk.gen.ts";

export const dealPaymentCreateCommand = define({
  name: "deal-payment-create",
  description: "Add a payment to an existing deal",
  args: {
    ...companyArgs,
    id: { type: "string" as const, description: "Deal ID", required: true },
    ...dealPaymentArgs,
  },
  examples: `$ freee deal-payment-create --id 42 --date 2026-08-15 --amount 5000 \\
    --walletable-type bank_account --walletable-id 9 --format json`,
  run: async (ctx) => {
    const { companyId, format } = initCommand(ctx);
    const id = parseCliInput(PositiveIntegerTextSchema, ctx.values.id, { label: "--id" });
    const body = parseDealPayment(ctx.values, companyId);
    const { data } = await createDealPayment({ path: { id }, body });
    return formatValue(
      data.deal,
      format,
      `${colors.green("Payment created:")} ${JSON.stringify(data.deal, null, 2)}`,
    );
  },
});
