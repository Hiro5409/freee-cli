import { define } from "gunshi";
import { args, choice, merge, required } from "gunshi/combinators";

import { fetchAll } from "../../api/paginate.ts";
import { isoDateArg } from "../../cli-input.ts";
import { listArgs } from "../../global-args.ts";
import { initCommand } from "../../helpers.ts";
import { formatOutput } from "../../output/formatter.ts";
import { getReceipts } from "../../types/freee/sdk.gen.ts";

const CATEGORIES = ["all", "without-deal", "expense-application", "with-deal", "ignored"] as const;
const CATEGORY_CODES = {
  all: "all",
  "without-deal": "without_deal",
  "expense-application": "with_expense_application_line",
  "with-deal": "with_deal",
  ignored: "ignored",
} as const satisfies Record<
  (typeof CATEGORIES)[number],
  "all" | "without_deal" | "with_expense_application_line" | "with_deal" | "ignored"
>;

export const fileBoxListCommand = define({
  name: "file-box-list",
  description: "List documents in the File Box",
  args: merge(
    listArgs,
    args({
      "start-date": required(isoDateArg("--start-date", "Upload date range start (YYYY-MM-DD)")),
      "end-date": required(isoDateArg("--end-date", "Upload date range end (YYYY-MM-DD)")),
      category: choice(CATEGORIES, {
        description: `Deal registration category: ${CATEGORIES.join(" | ")}`,
      }),
    }),
  ),
  run: async (ctx) => {
    const { companyId, format } = initCommand(ctx);
    const documents = await fetchAll(async (offset, limit) => {
      const { data } = await getReceipts({
        query: {
          company_id: companyId,
          offset,
          limit,
          start_date: ctx.values["start-date"],
          end_date: ctx.values["end-date"],
          category: ctx.values.category ? CATEGORY_CODES[ctx.values.category] : undefined,
        },
      });
      return data.receipts;
    }, ctx.values.limit);

    return formatOutput(documents, format);
  },
});
