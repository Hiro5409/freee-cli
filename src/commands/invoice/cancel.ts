import { define } from "gunshi";
import colors from "yoctocolors";

import { writeArgs } from "../../global-args.ts";
import { initCommand, parsePositiveId } from "../../helpers.ts";
import { formatDryRun, formatValue } from "../../output/formatter.ts";
import { invoicesCancel } from "../../types/freee-invoice/sdk.gen.ts";

export const invoiceCancelCommand = define({
  name: "invoice-cancel",
  description: "Cancel an invoice; a linked deal is also deleted by freee",
  args: {
    ...writeArgs,
    id: { type: "string" as const, description: "Invoice ID", required: true },
  },
  examples: `$ freee invoice-cancel --id 900 --dry-run --format json`,
  run: async (ctx) => {
    const { companyId, format } = initCommand(ctx);
    const id = parsePositiveId(ctx.values.id, "--id");
    const body = { company_id: companyId };
    const path = `/invoices/${id}/cancel`;

    if (ctx.values["dry-run"]) {
      return formatDryRun(
        format,
        { method: "PUT", path, body },
        `${colors.yellow("Dry run —")} would cancel invoice ${id}.`,
      );
    }

    const { data } = await invoicesCancel({ path: { id }, body });
    return formatValue(data.invoice, format, colors.green(`Invoice ${id} canceled.`));
  },
});
