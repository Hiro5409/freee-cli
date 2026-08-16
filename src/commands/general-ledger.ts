import { define } from "gunshi";

import { companyArgs } from "../global-args.ts";
import { initCommand, parseDate } from "../helpers.ts";
import { formatOutput } from "../output/formatter.ts";
import { getGeneralLedgers } from "../types/freee/sdk.gen.ts";

export const generalLedgerCommand = define({
  name: "general-ledger",
  description: "Show general-ledger balances for a date range",
  args: {
    ...companyArgs,
    "start-date": {
      type: "string" as const,
      description: "Date range start (YYYY-MM-DD)",
      required: true,
    },
    "end-date": {
      type: "string" as const,
      description: "Date range end (YYYY-MM-DD)",
      required: true,
    },
    "account-item-name": { type: "string" as const, description: "Filter by account item name" },
    "partner-name": { type: "string" as const, description: "Filter by partner name" },
    "item-name": { type: "string" as const, description: "Filter by item name" },
    "section-name": { type: "string" as const, description: "Filter by section name" },
    "tag-name": { type: "string" as const, description: "Filter by memo tag name" },
  },
  examples: `$ freee general-ledger --start-date 2026-01-01 --end-date 2026-12-31 \\
    --account-item-name 売上高 --format json`,
  run: async (ctx) => {
    const { companyId, format } = initCommand(ctx);
    const { data } = await getGeneralLedgers({
      query: {
        company_id: companyId,
        start_date: parseDate(ctx.values["start-date"], "--start-date"),
        end_date: parseDate(ctx.values["end-date"], "--end-date"),
        account_item_name: ctx.values["account-item-name"],
        partner_name: ctx.values["partner-name"],
        item_name: ctx.values["item-name"],
        section_name: ctx.values["section-name"],
        tag_name: ctx.values["tag-name"],
      },
    });
    return formatOutput(data.general_ledgers, format);
  },
});
