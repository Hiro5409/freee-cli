import { define } from "gunshi";
import { args, integer, merge, required } from "gunshi/combinators";

import { companyArgs } from "../../global-args.ts";
import { initCommand } from "../../helpers.ts";
import { formatResource } from "../../output/formatter.ts";
import { getUserMatcher } from "../../types/freee/sdk.gen.ts";

export const autoRegistrationRuleShowCommand = define({
  name: "auto-rule-show",
  description: "Show an auto-registration rule",
  args: merge(
    companyArgs,
    args({
      id: required(
        integer({ min: 1, max: Number.MAX_SAFE_INTEGER, description: "Auto-registration rule ID" }),
      ),
    }),
  ),
  run: async (ctx) => {
    const { companyId, format } = initCommand(ctx);
    const { data } = await getUserMatcher({
      path: { id: ctx.values.id },
      query: { company_id: companyId },
    });
    return formatResource(data, format);
  },
});
