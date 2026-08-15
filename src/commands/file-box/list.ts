import { define } from "gunshi";

import { fetchAll } from "../../api/paginate.ts";
import { listArgs } from "../../global-args.ts";
import { initCommand, parseDate, parseLimit } from "../../helpers.ts";
import { formatOutput } from "../../output/formatter.ts";
import { getReceipts } from "../../types/freee/sdk.gen.ts";

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
  },
  run: async (ctx) => {
    const { companyId, format } = initCommand(ctx);
    const startDate = parseDate(ctx.values["start-date"], "--start-date");
    const endDate = parseDate(ctx.values["end-date"], "--end-date");

    const documents = await fetchAll(async (offset, limit) => {
      const { data } = await getReceipts({
        query: {
          company_id: companyId,
          offset,
          limit,
          start_date: startDate,
          end_date: endDate,
        },
      });
      return data.receipts;
    }, parseLimit(ctx.values.limit));

    return formatOutput(documents, format);
  },
});
