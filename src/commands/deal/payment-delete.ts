import { define } from "gunshi";
import { args, integer, merge, required } from "gunshi/combinators";

import { dryRunArgs } from "../../global-args.ts";
import { initCommand } from "../../helpers.ts";
import { dryRunOutput } from "../../output/dry-run.ts";
import { destroyDealPayment } from "../../types/freee/sdk.gen.ts";

export const dealPaymentDeleteCommand = define({
  name: "delete",
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
  examples: `$ freee deal payment delete --id 42 --payment-id 7 --dry-run`,
  run: async (ctx) => {
    const { companyId } = initCommand(ctx);
    const id = ctx.values.id;
    const paymentId = ctx.values["payment-id"];
    const path = `/api/1/deals/${id}/payments/${paymentId}`;
    const query = { company_id: companyId };

    if (ctx.values["dry-run"]) {
      return dryRunOutput({ method: "DELETE", path, query });
    }

    await destroyDealPayment({ path: { id, payment_id: paymentId }, query });
    return JSON.stringify({ dealId: id, paymentId, deleted: true });
  },
});
