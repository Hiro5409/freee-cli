import { define } from "gunshi";
import colors from "yoctocolors";

import { PositiveIntegerTextSchema, parseCliInput } from "../../cli-input.ts";
import { companyArgs } from "../../global-args.ts";
import { initCommand } from "../../helpers.ts";
import { formatValue } from "../../output/formatter.ts";
import { invoicesUncancel } from "../../types/freee-invoice/sdk.gen.ts";

export const invoiceRestoreCommand = define({
  name: "invoice-restore",
  description: "Restore an invoice canceled through the freee invoice API",
  args: {
    ...companyArgs,
    id: { type: "string" as const, description: "Invoice ID", required: true },
  },
  examples: `$ freee invoice-restore --id 900 --format json`,
  run: async (ctx) => {
    const { companyId, format } = initCommand(ctx);
    const id = parseCliInput(PositiveIntegerTextSchema, ctx.values.id, { label: "--id" });
    const body = { company_id: companyId };
    const { data } = await invoicesUncancel({ path: { id }, body });
    return formatValue(data.invoice, format, colors.green(`Invoice ${id} restored.`));
  },
});
