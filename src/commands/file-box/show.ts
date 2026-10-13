import { define } from "gunshi";
import { args, integer, merge, required } from "gunshi/combinators";

import { companyArgs } from "../../global-args.ts";
import { initCommand } from "../../helpers.ts";
import { formatResource } from "../../output/formatter.ts";
import { getReceipt } from "../../types/freee/sdk.gen.ts";

export const fileBoxShowCommand = define({
  name: "file-box-show",
  description: "Show a document in the File Box",
  args: merge(
    companyArgs,
    args({
      id: required(
        integer({ min: 1, max: Number.MAX_SAFE_INTEGER, description: "File Box document ID" }),
      ),
    }),
  ),
  examples: "$ freee file-box-show --id 456 --format json",
  run: async (ctx) => {
    const { companyId, format } = initCommand(ctx);
    const { data } = await getReceipt({
      path: { id: ctx.values.id },
      query: { company_id: companyId },
    });
    return formatResource(data.receipt, format);
  },
});
