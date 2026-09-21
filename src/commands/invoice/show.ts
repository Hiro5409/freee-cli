import { define } from "gunshi";
import { args, integer, merge, required } from "gunshi/combinators";

import { companyArgs } from "../../global-args.ts";
import { initCommand } from "../../helpers.ts";
import { formatResource } from "../../output/formatter.ts";
import { invoicesShow } from "../../types/freee-invoice/sdk.gen.ts";

export const invoiceShowCommand = define({
  name: "invoice-show",
  description: "Show an invoice from the freee invoice API",
  args: merge(
    companyArgs,
    args({
      id: required(integer({ min: 1, max: Number.MAX_SAFE_INTEGER, description: "Invoice ID" })),
    }),
  ),
  examples: "$ freee invoice-show --id 456 --format json",
  run: async (ctx) => {
    const { companyId, format } = initCommand(ctx);

    const { data } = await invoicesShow({
      path: { id: ctx.values.id },
      query: { company_id: companyId },
    });
    return formatResource(data.invoice, format);
  },
});
