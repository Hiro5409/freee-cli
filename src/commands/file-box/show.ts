import { define } from "gunshi";

import { PositiveIntegerTextSchema, parseCliInput } from "../../cli-input.ts";
import { companyArgs } from "../../global-args.ts";
import { initCommand } from "../../helpers.ts";
import { formatResource } from "../../output/formatter.ts";
import { getReceipt } from "../../types/freee/sdk.gen.ts";

export const fileBoxShowCommand = define({
  name: "file-box-show",
  description: "Show a document in the File Box",
  args: {
    ...companyArgs,
    id: { type: "string" as const, description: "File Box document ID", required: true },
  },
  examples: "$ freee file-box-show --id 456 --format json",
  run: async (ctx) => {
    const { companyId, format } = initCommand(ctx);
    const { data } = await getReceipt({
      path: { id: parseCliInput(PositiveIntegerTextSchema, ctx.values.id, { label: "--id" }) },
      query: { company_id: companyId },
    });
    return formatResource(data.receipt, format);
  },
});
