import { define } from "gunshi";

import { fetchAll } from "../../api/paginate.ts";
import { companyArgs } from "../../global-args.ts";
import { initCommand, monthToDateRange } from "../../helpers.ts";
import { formatOutput } from "../../output/formatter.ts";
import { getReceipts } from "../../types/freee/sdk.gen.ts";

export const receiptListCommand = define({
  name: "receipt-list",
  description: "List receipts",
  args: {
    ...companyArgs,
    month: { type: "string" as const, description: "Filter by month (YYYY-MM)" },
  },
  run: async (ctx) => {
    const { companyId, format } = initCommand(ctx);
    const month = ctx.values.month ?? new Date().toISOString().slice(0, 7);
    const { start, end } = monthToDateRange(month);

    const receipts = await fetchAll(async (offset, limit) => {
      const { data } = await getReceipts({
        query: {
          company_id: companyId,
          offset,
          limit,
          start_date: start,
          end_date: end,
        },
      });
      return data.receipts;
    });

    return formatOutput(receipts, format);
  },
});
