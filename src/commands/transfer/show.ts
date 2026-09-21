import { define } from "gunshi";
import { args, integer, merge, required } from "gunshi/combinators";

import { companyArgs } from "../../global-args.ts";
import { initCommand } from "../../helpers.ts";
import { formatResource } from "../../output/formatter.ts";
import { getTransfer } from "../../types/freee/sdk.gen.ts";

export const transferShowCommand = define({
  name: "transfer-show",
  description: "Show an account transfer",
  args: merge(
    companyArgs,
    args({
      id: required(integer({ min: 1, max: Number.MAX_SAFE_INTEGER, description: "Transfer ID" })),
    }),
  ),
  examples: `$ freee transfer-show --id 42 --format json`,
  run: async (ctx) => {
    const { companyId, format } = initCommand(ctx);
    const { data } = await getTransfer({
      path: { id: ctx.values.id },
      query: { company_id: companyId },
    });
    return formatResource(data.transfer, format);
  },
});
