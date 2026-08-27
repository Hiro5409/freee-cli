import { define } from "gunshi";

import { PositiveIntegerTextSchema, parseCliInput } from "../../cli-input.ts";
import { companyArgs } from "../../global-args.ts";
import { initCommand } from "../../helpers.ts";
import { formatResource } from "../../output/formatter.ts";
import { getUserMatcher } from "../../types/freee/sdk.gen.ts";

export const autoRegistrationRuleShowCommand = define({
  name: "auto-rule-show",
  description: "Show an auto-registration rule",
  args: {
    ...companyArgs,
    id: { type: "string" as const, description: "Auto-registration rule ID", required: true },
  },
  run: async (ctx) => {
    const { companyId, format } = initCommand(ctx);
    const { data } = await getUserMatcher({
      path: { id: parseCliInput(PositiveIntegerTextSchema, ctx.values.id, { label: "--id" }) },
      query: { company_id: companyId },
    });
    return formatResource(data, format);
  },
});
