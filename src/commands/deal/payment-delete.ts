import { define } from "gunshi";
import { args, integer, merge, required } from "gunshi/combinators";
import colors from "yoctocolors";

import { dryRunArgs } from "../../global-args.ts";
import { initCommand } from "../../helpers.ts";
import { formatDryRun, formatValue } from "../../output/formatter.ts";
import { destroyDealPayment } from "../../types/freee/sdk.gen.ts";

export const dealPaymentDeleteCommand = define({
  name: "deal-payment-delete",
  description: "Delete a payment from a deal",
  args: merge(
    dryRunArgs,
    args({
      id: required(integer({ min: 1, max: Number.MAX_SAFE_INTEGER, description: "Deal ID" })),
      "payment-id": required(
        integer({ min: 1, max: Number.MAX_SAFE_INTEGER, description: "Payment ID" }),
      ),
    }),
  ),
  examples: `$ freee deal-payment-delete --id 42 --payment-id 7 --dry-run --format json`,
  run: async (ctx) => {
    const { companyId, format } = initCommand(ctx);
    const id = ctx.values.id;
    const paymentId = ctx.values["payment-id"];
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
