import { define } from "gunshi";

import { companyArgs } from "../../global-args.ts";
import { initCommand, parsePositiveId } from "../../helpers.ts";
import { formatOutput } from "../../output/formatter.ts";
import { getUserMatcher } from "../../types/freee/sdk.gen.ts";

export const autoRuleShowCommand = define({
  name: "auto-rule-show",
  description: "Show auto-registration rule details",
  args: {
    ...companyArgs,
    id: { type: "string" as const, description: "Auto rule ID", required: true },
  },
  run: async (ctx) => {
    const { companyId, format } = initCommand(ctx);
    const { data } = await getUserMatcher({
      path: { id: parsePositiveId(ctx.values.id, "--id") },
      query: { company_id: companyId },
    });
    return formatOutput([data], format);
  },
});
