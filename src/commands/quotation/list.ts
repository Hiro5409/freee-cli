import { define } from "gunshi";
import { args, choice, merge, string } from "gunshi/combinators";

import { fetchAllInvoiceRecords } from "../../api/invoice-paginate.ts";
import { monthArg } from "../../cli-input.ts";
import { listArgs } from "../../global-args.ts";
import { initCommand, monthToDateRange } from "../../helpers.ts";
import { formatOutput } from "../../output/formatter.ts";
import { quotationsIndex } from "../../types/freee-invoice/sdk.gen.ts";

export const quotationListCommand = define({
  name: "list",
  description: "List quotations from the freee invoice API",
  args: merge(
    listArgs,
    args({
      month: monthArg("--month", "Filter by quotation month (YYYY-MM)"),
      "quotation-number": string({ description: "Filter by quotation number" }),
      subject: string({ description: "Filter by subject" }),
      "sending-status": choice(["sent", "unsent"], {
        description: "Sending status: sent | unsent",
      }),
      "cancel-status": choice(["canceled", "uncanceled"], {
        description: "Cancellation status: canceled | uncanceled",
      }),
    }),
  ),
  examples: "$ freee quotation list --month 2026-10 --format json",
  run: async (ctx) => {
    const { companyId, format } = initCommand(ctx);
    const month = ctx.values.month ? monthToDateRange(ctx.values.month) : undefined;
    const quotations = await fetchAllInvoiceRecords(async (offset, limit) => {
      const { data } = await quotationsIndex({
        query: {
          company_id: companyId,
          start_quotation_date: month?.start,
          end_quotation_date: month?.end,
          quotation_number: ctx.values["quotation-number"],
          subject: ctx.values.subject,
          sending_status: ctx.values["sending-status"],
          cancel_status: ctx.values["cancel-status"],
          offset,
          limit,
        },
      });
      return data.quotations;
    }, ctx.values.limit);
    return formatOutput(quotations, format);
  },
});
