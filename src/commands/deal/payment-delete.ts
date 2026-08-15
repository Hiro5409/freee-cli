import { define } from "gunshi";
import colors from "yoctocolors";

import { writeArgs } from "../../global-args.ts";
import { initCommand, parsePositiveId } from "../../helpers.ts";
import { formatDryRun, formatValue } from "../../output/formatter.ts";
import { destroyDealPayment } from "../../types/freee/sdk.gen.ts";

export const dealPaymentDeleteCommand = define({
  name: "deal-payment-delete",
  description: "Delete a payment from a deal",
  args: {
    ...writeArgs,
    id: { type: "string" as const, description: "Deal ID", required: true },
    "payment-id": { type: "string" as const, description: "Payment ID", required: true },
  },
  examples: `$ freee deal-payment-delete --id 42 --payment-id 7 --dry-run --format json`,
  run: async (ctx) => {
    const { companyId, format } = initCommand(ctx);
    const id = parsePositiveId(ctx.values.id, "--id");
    const paymentId = parsePositiveId(ctx.values["payment-id"], "--payment-id");
    const path = `/api/1/deals/${id}/payments/${paymentId}`;
    const query = { company_id: companyId };

    if (ctx.values["dry-run"]) {
      return formatDryRun(
        format,
        { method: "DELETE", path, query },
        `${colors.yellow("Dry run —")} would delete payment ${paymentId} from deal ${id}.`,
      );
    }

    await destroyDealPayment({ path: { id, payment_id: paymentId }, query });
    return formatValue(
      { dealId: id, paymentId, deleted: true },
      format,
      colors.green(`Payment ${paymentId} deleted from deal ${id}.`),
    );
  },
});
