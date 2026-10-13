import { define } from "gunshi";
import { args, integer, merge, required } from "gunshi/combinators";

import { companyArgs } from "../../global-args.ts";
import { initCommand } from "../../helpers.ts";
import { formatResource } from "../../output/formatter.ts";
import { getPartner } from "../../types/freee/sdk.gen.ts";

export const partnerShowCommand = define({
  name: "partner-show",
  description: "Show partner details",
  args: merge(
    companyArgs,
    args({
      id: required(integer({ min: 1, max: Number.MAX_SAFE_INTEGER, description: "Partner ID" })),
    }),
  ),
  examples: `$ freee partner-show --id 42 --format json`,
  run: async (ctx) => {
    const { companyId, format } = initCommand(ctx);
    const { data } = await getPartner({
      path: { id: ctx.values.id },
      query: { company_id: companyId },
    });
    return formatResource(data.partner, format);
  },
});
