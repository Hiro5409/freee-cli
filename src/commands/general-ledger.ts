import { define } from "gunshi";
import { args, merge, required, string } from "gunshi/combinators";

import { isoDateArg } from "../cli-input.ts";
import { companyArgs } from "../global-args.ts";
import { initCommand } from "../helpers.ts";
import { formatOutput } from "../output/formatter.ts";
import { getGeneralLedgers } from "../types/freee/sdk.gen.ts";

export const generalLedgerCommand = define({
  name: "general-ledger",
  description: "Show general-ledger balances for a date range (corporate Advance or Enterprise)",
  args: merge(
    companyArgs,
    args({
      "start-date": required(isoDateArg("--start-date", "Date range start (YYYY-MM-DD)")),
      "end-date": required(isoDateArg("--end-date", "Date range end (YYYY-MM-DD)")),
      "account-item-name": string({ description: "Filter by account item name" }),
      "partner-name": string({ description: "Filter by partner name" }),
      "item-name": string({ description: "Filter by item name" }),
      "section-name": string({ description: "Filter by section name" }),
      "tag-name": string({ description: "Filter by memo tag name" }),
    }),
  ),
  examples: `$ freee general-ledger --start-date 2026-01-01 --end-date 2026-12-31 \\
    --account-item-name 売上高 --format json`,
  run: async (ctx) => {
    const { companyId, format } = initCommand(ctx);
    const { data } = await getGeneralLedgers({
      query: {
        company_id: companyId,
        start_date: ctx.values["start-date"],
        end_date: ctx.values["end-date"],
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
