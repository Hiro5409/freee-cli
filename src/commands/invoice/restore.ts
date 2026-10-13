import { define } from "gunshi";
import { args, integer, merge, required } from "gunshi/combinators";
import colors from "yoctocolors";

import { companyArgs } from "../../global-args.ts";
import { initCommand } from "../../helpers.ts";
import { formatValue } from "../../output/formatter.ts";
import { invoicesUncancel } from "../../types/freee-invoice/sdk.gen.ts";

export const invoiceRestoreCommand = define({
  name: "invoice-restore",
  description: "Restore an invoice canceled through the freee invoice API",
  args: merge(
    companyArgs,
    args({
      id: required(integer({ min: 1, max: Number.MAX_SAFE_INTEGER, description: "Invoice ID" })),
    }),
  ),
  examples: `$ freee invoice-restore --id 900 --format json`,
  run: async (ctx) => {
    const { companyId, format } = initCommand(ctx);
    const id = ctx.values.id;
    const body = { company_id: companyId };
    const { data } = await invoicesUncancel({ path: { id }, body });
    return formatValue(data.invoice, format, colors.green(`Invoice ${id} restored.`));
  },
});
