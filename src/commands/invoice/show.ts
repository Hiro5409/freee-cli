import { define } from "gunshi";

import { companyArgs } from "../../global-args.ts";
import { initCommand, parsePositiveId } from "../../helpers.ts";
import { formatResource } from "../../output/formatter.ts";
import { invoicesShow } from "../../types/freee-invoice/sdk.gen.ts";

export const invoiceShowCommand = define({
  name: "invoice-show",
  description: "Show an invoice from the freee invoice API",
  args: {
    ...companyArgs,
    id: { type: "string" as const, description: "Invoice ID", required: true },
  },
  examples: "$ freee invoice-show --id 456 --format json",
  run: async (ctx) => {
    const { companyId, format } = initCommand(ctx);

    const { data } = await invoicesShow({
      path: { id: parsePositiveId(ctx.values.id, "--id") },
      query: { company_id: companyId },
    });
    return formatResource(data.invoice, format);
  },
});
