import { define } from "gunshi";
import { args, integer, merge, required } from "gunshi/combinators";

import { dryRunArgs } from "../../global-args.ts";
import { initCommand } from "../../helpers.ts";
import { dryRunOutput } from "../../output/dry-run.ts";
import { invoicesCancel } from "../../types/freee-invoice/sdk.gen.ts";

export const invoiceCancelCommand = define({
  name: "cancel",
  description: "Cancel an invoice; a linked deal is also deleted by freee",
  args: merge(
    dryRunArgs,
    args({
      id: required(integer({ min: 1, max: Number.MAX_SAFE_INTEGER, description: "Invoice ID" })),
    }),
  ),
  examples: `$ freee invoice cancel --id 900 --dry-run`,
  run: async (ctx) => {
    const { companyId } = initCommand(ctx);
    const id = ctx.values.id;
    const body = { company_id: companyId };
    const path = `/invoices/${id}/cancel`;

    if (ctx.values["dry-run"]) {
      return dryRunOutput({ method: "PUT", path, body });
    }

    const { data } = await invoicesCancel({ path: { id }, body });
    return JSON.stringify(data.invoice);
  },
});
