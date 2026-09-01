import { define } from "gunshi";
import colors from "yoctocolors";

import { PositiveIntegerTextSchema, parseCliInput } from "../../cli-input.ts";
import { dealPaymentArgs, parseDealPayment } from "../../deal-payment.ts";
import { dryRunArgs } from "../../global-args.ts";
import { initCommand } from "../../helpers.ts";
import { formatDryRun, formatValue } from "../../output/formatter.ts";
import { updateDealPayment } from "../../types/freee/sdk.gen.ts";

export const dealPaymentUpdateCommand = define({
  name: "deal-payment-update",
  description: "Update a payment on a deal",
  args: {
    ...dryRunArgs,
    id: { type: "string" as const, description: "Deal ID", required: true },
    "payment-id": { type: "string" as const, description: "Payment ID", required: true },
    ...dealPaymentArgs,
  },
  examples: `$ freee deal-payment-update --id 42 --payment-id 7 --date 2026-08-20 \\
    --amount 4000 --walletable-type bank_account --walletable-id 9 --dry-run --format json`,
  run: async (ctx) => {
    const { companyId, format } = initCommand(ctx);
    const id = parseCliInput(PositiveIntegerTextSchema, ctx.values.id, { label: "--id" });
    const paymentId = parseCliInput(PositiveIntegerTextSchema, ctx.values["payment-id"], {
      label: "--payment-id",
    });
    const body = parseDealPayment(ctx.values, companyId);
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
