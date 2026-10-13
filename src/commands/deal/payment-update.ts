import { define } from "gunshi";
import { args, integer, merge, required } from "gunshi/combinators";
import colors from "yoctocolors";

import { dealPaymentArgs, dealPaymentParams } from "../../deal-payment.ts";
import { dryRunArgs } from "../../global-args.ts";
import { initCommand } from "../../helpers.ts";
import { formatDryRun, formatValue } from "../../output/formatter.ts";
import { updateDealPayment } from "../../types/freee/sdk.gen.ts";

export const dealPaymentUpdateCommand = define({
  name: "deal-payment-update",
  description: "Update a payment on a deal",
  args: merge(
    dryRunArgs,
    args({
      id: required(integer({ min: 1, max: Number.MAX_SAFE_INTEGER, description: "Deal ID" })),
      "payment-id": required(
        integer({ min: 1, max: Number.MAX_SAFE_INTEGER, description: "Payment ID" }),
      ),
    }),
    dealPaymentArgs,
  ),
  examples: `$ freee deal-payment-update --id 42 --payment-id 7 --date 2026-08-20 \\
    --amount 4000 --walletable-type bank_account --walletable-id 9 --dry-run --format json`,
  run: async (ctx) => {
    const { companyId, format } = initCommand(ctx);
    const id = ctx.values.id;
    const paymentId = ctx.values["payment-id"];
    const body = dealPaymentParams(ctx.values, companyId);
    const path = `/api/1/deals/${id}/payments/${paymentId}`;

    if (ctx.values["dry-run"]) {
      return formatDryRun(
        format,
        { method: "PUT", path, body },
        `${colors.yellow("Dry run —")} would update payment ${paymentId} on deal ${id}.`,
      );
    }

    const { data } = await updateDealPayment({
      path: { id, payment_id: paymentId },
      body,
    });
    return formatValue(
      data.deal,
      format,
      `${colors.green("Payment updated:")} ${JSON.stringify(data.deal, null, 2)}`,
    );
  },
});
