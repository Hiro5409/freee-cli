import { define } from "gunshi";
import { args, integer, merge, required } from "gunshi/combinators";

import { companyArgs } from "../../global-args.ts";
import { initCommand } from "../../helpers.ts";
import { formatResource } from "../../output/formatter.ts";
import { quotationsShow } from "../../types/freee-invoice/sdk.gen.ts";

export const quotationShowCommand = define({
  name: "quotation-show",
  description: "Show a quotation from the freee invoice API",
  args: merge(
    companyArgs,
    args({ id: required(integer({ min: 1, max: 2147483647, description: "Quotation ID" })) }),
  ),
  examples: "$ freee quotation-show --id 456 --format json",
  run: async (ctx) => {
    const { companyId, format } = initCommand(ctx);
    const { data } = await quotationsShow({
      path: { id: ctx.values.id },
      query: { company_id: companyId },
    });
    return formatResource(data.quotation, format);
  },
});
