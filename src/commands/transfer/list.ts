import { define } from "gunshi";
import { args, merge } from "gunshi/combinators";

import { fetchAll } from "../../api/paginate.ts";
import { monthArg } from "../../cli-input.ts";
import { listArgs } from "../../global-args.ts";
import { initCommand, monthToDateRange } from "../../helpers.ts";
import { getTransfers } from "../../types/freee/sdk.gen.ts";

export const transferListCommand = define({
  name: "list",
  description: "List account transfers",
  args: merge(listArgs, args({ month: monthArg("--month", "Filter by month (YYYY-MM)") })),
  run: async (ctx) => {
    const { companyId } = initCommand(ctx);
    const dates = ctx.values.month ? monthToDateRange(ctx.values.month) : undefined;
    const transfers = await fetchAll(async (offset, limit) => {
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
    }, ctx.values.limit);
    return JSON.stringify(transfers);
  },
});
