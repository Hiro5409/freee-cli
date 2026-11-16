import { define } from "gunshi";
import { args, integer, merge, required } from "gunshi/combinators";

import { companyArgs } from "../../global-args.ts";
import { initCommand } from "../../helpers.ts";
import { invoicesUncancel } from "../../types/freee-invoice/sdk.gen.ts";

export const invoiceRestoreCommand = define({
  name: "restore",
  description: "Restore an invoice canceled through the freee invoice API",
  args: merge(
    companyArgs,
    args({
      id: required(integer({ min: 1, max: Number.MAX_SAFE_INTEGER, description: "Invoice ID" })),
    }),
  ),
  examples: `$ freee invoice restore --id 900`,
  run: async (ctx) => {
    const { companyId } = initCommand(ctx);
    const id = ctx.values.id;
    const body = { company_id: companyId };
    const { data } = await invoicesUncancel({ path: { id }, body });
    return JSON.stringify(data.invoice);
  },
});
