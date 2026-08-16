import { define } from "gunshi";

import { fetchAll } from "../../api/paginate.ts";
import { listArgs } from "../../global-args.ts";
import {
  initCommand,
  monthToDateRange,
  parseChoice,
  parseLimit,
  parsePositiveId,
} from "../../helpers.ts";
import { formatOutput } from "../../output/formatter.ts";
import { getDeals } from "../../types/freee/sdk.gen.ts";

export const dealListCommand = define({
  name: "deal-list",
  description: "List deals (transactions)",
  args: {
    ...listArgs,
    month: { type: "string" as const, description: "Filter by month (YYYY-MM)" },
    type: { type: "string" as const, description: "Filter by type: income | expense" },
    status: { type: "string" as const, description: "Filter by status: unsettled | settled" },
    "account-item-id": { type: "string" as const, description: "Filter by account item ID" },
    "partner-id": { type: "string" as const, description: "Filter by partner ID" },
    "partner-code": { type: "string" as const, description: "Filter by partner code" },
    accruals: { type: "string" as const, description: "Include accrual rows: without | with" },
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
          type: ctx.values.type
            ? parseChoice(ctx.values.type, ["income", "expense"] as const, "--type")
            : undefined,
          status: ctx.values.status
            ? parseChoice(ctx.values.status, ["unsettled", "settled"] as const, "--status")
            : undefined,
          account_item_id: ctx.values["account-item-id"]
            ? parsePositiveId(ctx.values["account-item-id"], "--account-item-id")
            : undefined,
          partner_id: ctx.values["partner-id"]
            ? parsePositiveId(ctx.values["partner-id"], "--partner-id")
            : undefined,
          partner_code: ctx.values["partner-code"],
          accruals: ctx.values.accruals
            ? parseChoice(ctx.values.accruals, ["without", "with"] as const, "--accruals")
            : undefined,
        },
      });
      return data.deals;
    }, parseLimit(ctx.values.limit));

    return formatOutput(deals, format);
  },
});
