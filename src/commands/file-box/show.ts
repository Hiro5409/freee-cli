import { define } from "gunshi";

import { companyArgs } from "../../global-args.ts";
import { initCommand, parsePositiveId } from "../../helpers.ts";
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
      path: { id: parsePositiveId(ctx.values.id, "--id") },
      query: { company_id: companyId },
    });
    return formatResource(data.receipt, format);
  },
});
