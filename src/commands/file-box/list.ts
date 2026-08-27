import { define } from "gunshi";

import { fetchAll } from "../../api/paginate.ts";
import { IsoDateSchema, OptionalLimitTextSchema, parseCliInput } from "../../cli-input.ts";
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
  args: {
    ...listArgs,
    "start-date": {
      type: "string" as const,
      description: "Upload date range start (YYYY-MM-DD)",
      required: true,
    },
    "end-date": {
      type: "string" as const,
      description: "Upload date range end (YYYY-MM-DD)",
      required: true,
    },
    category: {
      type: "enum" as const,
      choices: CATEGORIES,
      description: `Deal registration category: ${CATEGORIES.join(" | ")}`,
    },
  },
  run: async (ctx) => {
    const { companyId, format } = initCommand(ctx);
    const startDate = parseCliInput(IsoDateSchema, ctx.values["start-date"], {
      label: "--start-date",
    });
    const endDate = parseCliInput(IsoDateSchema, ctx.values["end-date"], { label: "--end-date" });

    const documents = await fetchAll(
      async (offset, limit) => {
        const { data } = await getReceipts({
          query: {
            company_id: companyId,
            offset,
            limit,
            start_date: startDate,
            end_date: endDate,
            category: ctx.values.category ? CATEGORY_CODES[ctx.values.category] : undefined,
          },
        });
        return data.receipts;
      },
      parseCliInput(OptionalLimitTextSchema, ctx.values.limit, { label: "--limit" }),
    );

    return formatOutput(documents, format);
  },
});
