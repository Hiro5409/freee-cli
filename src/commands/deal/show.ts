import { define } from "gunshi";
import { args, integer, merge, required } from "gunshi/combinators";

import { companyArgs } from "../../global-args.ts";
import { initCommand } from "../../helpers.ts";
import { formatResource } from "../../output/formatter.ts";
import { getDeal } from "../../types/freee/sdk.gen.ts";

export const dealShowCommand = define({
  name: "deal-show",
  description: "Show deal details",
  args: merge(
    companyArgs,
    args({
      id: required(integer({ min: 1, max: Number.MAX_SAFE_INTEGER, description: "Deal ID" })),
    }),
  ),
  run: async (ctx) => {
    const { companyId, format } = initCommand(ctx);
    const { data } = await getDeal({
      path: { id: ctx.values.id },
      query: { company_id: companyId },
    });
    return formatResource(data.deal, format);
  },
});
