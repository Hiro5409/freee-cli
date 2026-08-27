import { define } from "gunshi";

import { fetchAll } from "../../api/paginate.ts";
import { MonthTextSchema, OptionalLimitTextSchema, parseCliInput } from "../../cli-input.ts";
import { listArgs } from "../../global-args.ts";
import { initCommand, monthToDateRange } from "../../helpers.ts";
import { formatOutput } from "../../output/formatter.ts";
import { getTransfers } from "../../types/freee/sdk.gen.ts";

export const transferListCommand = define({
  name: "transfer-list",
  description: "List account transfers",
  args: {
    ...listArgs,
    month: { type: "string" as const, description: "Filter by month (YYYY-MM)" },
  },
  run: async (ctx) => {
    const { companyId, format } = initCommand(ctx);
    const dates = ctx.values.month
      ? monthToDateRange(parseCliInput(MonthTextSchema, ctx.values.month, { label: "--month" }))
      : undefined;
    const transfers = await fetchAll(
      async (offset, limit) => {
        const { data } = await getTransfers({
          query: {
            company_id: companyId,
            start_date: dates?.start,
            end_date: dates?.end,
            offset,
            limit,
          },
        });
        return data.transfers;
      },
      parseCliInput(OptionalLimitTextSchema, ctx.values.limit, { label: "--limit" }),
    );
    return formatOutput(transfers, format);
  },
});
