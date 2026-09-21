import { define } from "gunshi";
import { args, choice, integer, merge, string } from "gunshi/combinators";

import { fetchAll } from "../../api/paginate.ts";
import { monthArg } from "../../cli-input.ts";
import { listArgs } from "../../global-args.ts";
import { initCommand, monthToDateRange } from "../../helpers.ts";
import { formatOutput } from "../../output/formatter.ts";
import { getDeals } from "../../types/freee/sdk.gen.ts";

const DEAL_TYPES = ["income", "expense"] as const;
const DEAL_STATUSES = ["unsettled", "settled"] as const;
const ACCRUAL_FILTERS = ["without", "with"] as const;

export const dealListCommand = define({
  name: "deal-list",
  description: "List deals (transactions)",
  args: merge(
    listArgs,
    args({
      month: monthArg("--month", "Filter by month (YYYY-MM)"),
      type: choice(DEAL_TYPES, { description: "Filter by type: income | expense" }),
      status: choice(DEAL_STATUSES, { description: "Filter by status: unsettled | settled" }),
      "account-item-id": integer({
        min: 1,
        max: Number.MAX_SAFE_INTEGER,
        description: "Filter by account item ID",
      }),
      "partner-id": integer({
        min: 1,
        max: Number.MAX_SAFE_INTEGER,
        description: "Filter by partner ID",
      }),
      "partner-code": string({ description: "Filter by partner code" }),
      accruals: choice(ACCRUAL_FILTERS, { description: "Include accrual rows: without | with" }),
    }),
  ),
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
          type: ctx.values.type,
          status: ctx.values.status,
          account_item_id: ctx.values["account-item-id"],
          partner_id: ctx.values["partner-id"],
          partner_code: ctx.values["partner-code"],
          accruals: ctx.values.accruals,
        },
      });
      return data.deals;
    }, ctx.values.limit);

    return formatOutput(deals, format);
  },
});
