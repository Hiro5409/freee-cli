import { define } from "gunshi";

import { fetchAll } from "../../api/paginate.ts";
import { companyArgs } from "../../global-args.ts";
import { initCommand, parseChoice } from "../../helpers.ts";
import { formatOutput } from "../../output/formatter.ts";
import { getUserMatchers } from "../../types/freee/sdk.gen.ts";

const ACTIVE_FILTERS = ["active", "inactive", "all"] as const;
const ENTRY_SIDES = ["income", "expense"] as const;

export const autoRuleListCommand = define({
  name: "auto-rule-list",
  description: "List auto-registration rules",
  args: {
    ...companyArgs,
    active: {
      type: "string" as const,
      description: `Filter by status: ${ACTIVE_FILTERS.join(" | ")}`,
    },
    description: { type: "string" as const, description: "Filter by rule description" },
    "entry-side": { type: "string" as const, description: "Filter by income or expense" },
    walletable: { type: "string" as const, description: "Filter by account name" },
  },
  run: async (ctx) => {
    const { companyId, format } = initCommand(ctx);

    const rules = await fetchAll(async (offset, limit) => {
      const { data } = await getUserMatchers({
        query: {
          company_id: companyId,
          offset,
          limit,
          active: ctx.values.active
            ? parseChoice(ctx.values.active, ACTIVE_FILTERS, "--active")
            : undefined,
          description: ctx.values.description,
          entry_side_str: ctx.values["entry-side"]
            ? parseChoice(ctx.values["entry-side"], ENTRY_SIDES, "--entry-side")
            : undefined,
          walletable: ctx.values.walletable,
        },
      });
      return data.data;
    });

    return formatOutput(rules, format);
  },
});
