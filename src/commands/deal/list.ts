import { define } from "gunshi";

import { fetchAll } from "../../api/paginate.ts";
import { listArgs } from "../../global-args.ts";
import { initCommand, monthToDateRange, parseLimit } from "../../helpers.ts";
import { formatOutput } from "../../output/formatter.ts";
import { getDeals } from "../../types/freee/sdk.gen.ts";

export const dealListCommand = define({
  name: "deal-list",
  description: "List deals (transactions)",
  args: {
    ...listArgs,
    month: { type: "string" as const, description: "Filter by month (YYYY-MM)" },
  },
  run: async (ctx) => {
    const { companyId, format } = initCommand(ctx);

    const monthFilter = ctx.values.month ? monthToDateRange(ctx.values.month) : undefined;

    const deals = await fetchAll(async (offset, limit) => {
      const { data } = await getDeals({
        query: {
          company_id: companyId,
          offset,
          limit,
          start_issue_date: monthFilter?.start,
          end_issue_date: monthFilter?.end,
        },
      });
      return data.deals;
    }, parseLimit(ctx.values.limit));

    return formatOutput(deals, format);
  },
});
