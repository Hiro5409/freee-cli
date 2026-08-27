import { define } from "gunshi";

import { fetchAll } from "../../api/paginate.ts";
import {
  MonthTextSchema,
  OptionalLimitTextSchema,
  PositiveIntegerTextSchema,
  parseCliInput,
} from "../../cli-input.ts";
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
  args: {
    ...listArgs,
    month: { type: "string" as const, description: "Filter by month (YYYY-MM)" },
    type: {
      type: "enum" as const,
      choices: DEAL_TYPES,
      description: "Filter by type: income | expense",
    },
    status: {
      type: "enum" as const,
      choices: DEAL_STATUSES,
      description: "Filter by status: unsettled | settled",
    },
    "account-item-id": { type: "string" as const, description: "Filter by account item ID" },
    "partner-id": { type: "string" as const, description: "Filter by partner ID" },
    "partner-code": { type: "string" as const, description: "Filter by partner code" },
    accruals: {
      type: "enum" as const,
      choices: ACCRUAL_FILTERS,
      description: "Include accrual rows: without | with",
    },
  },
  run: async (ctx) => {
    const { companyId, format } = initCommand(ctx);

    const monthFilter = ctx.values.month
      ? monthToDateRange(parseCliInput(MonthTextSchema, ctx.values.month, { label: "--month" }))
      : undefined;

    const deals = await fetchAll(
      async (offset, limit) => {
        const { data } = await getDeals({
          query: {
            company_id: companyId,
            offset,
            limit,
            start_issue_date: monthFilter?.start,
            end_issue_date: monthFilter?.end,
            type: ctx.values.type,
            status: ctx.values.status,
            account_item_id: ctx.values["account-item-id"]
              ? parseCliInput(PositiveIntegerTextSchema, ctx.values["account-item-id"], {
                  label: "--account-item-id",
                })
              : undefined,
            partner_id: ctx.values["partner-id"]
              ? parseCliInput(PositiveIntegerTextSchema, ctx.values["partner-id"], {
                  label: "--partner-id",
                })
              : undefined,
            partner_code: ctx.values["partner-code"],
            accruals: ctx.values.accruals,
          },
        });
        return data.deals;
      },
      parseCliInput(OptionalLimitTextSchema, ctx.values.limit, { label: "--limit" }),
    );

    return formatOutput(deals, format);
  },
});
