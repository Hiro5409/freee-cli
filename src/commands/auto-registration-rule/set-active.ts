import { define } from "gunshi";
import colors from "yoctocolors";

import { PositiveIntegerTextSchema, parseCliInput } from "../../cli-input.ts";
import { dryRunArgs } from "../../global-args.ts";
import { initCommand } from "../../helpers.ts";
import { formatDryRun } from "../../output/formatter.ts";
import { getUserMatcher, updateUserMatcher } from "../../types/freee/sdk.gen.ts";
import { currentRuleBody } from "./rule-body.ts";

function defineSetActiveCommand(active: boolean) {
  const verb = active ? "enable" : "disable";
  return define({
    name: `auto-rule-${verb}`,
    description: `${active ? "Enable" : "Disable"} an auto-registration rule`,
    args: {
      ...dryRunArgs,
      id: {
        type: "string" as const,
        description: "Auto-registration rule ID",
        required: true,
      },
    },
    examples: `$ freee auto-rule-${verb} --id 42 --dry-run --format json`,
    run: async (ctx) => {
      const { companyId, format } = initCommand(ctx);
      const id = parseCliInput(PositiveIntegerTextSchema, ctx.values.id, { label: "--id" });

      const { data: current } = await getUserMatcher({
        path: { id },
        query: { company_id: companyId },
      });
      const body = { ...currentRuleBody(current), active };

      if (ctx.values["dry-run"]) {
        return formatDryRun(
          format,
          {
            method: "PUT",
            path: `/api/1/user_matchers/${id}`,
            query: { company_id: companyId },
            body,
          },
          `${colors.yellow("Dry run —")} would PUT /api/1/user_matchers/${id}: ${JSON.stringify(body, null, 2)}`,
        );
      }

      const { data } = await updateUserMatcher({
        path: { id },
        query: { company_id: companyId },
        body,
      });

      if (format === "json") return JSON.stringify(data, null, 2);
      return colors.green(`Auto-registration rule ${verb}d: id=${data.id} active=${data.active}`);
    },
  });
}

export const autoRegistrationRuleEnableCommand = defineSetActiveCommand(true);
export const autoRegistrationRuleDisableCommand = defineSetActiveCommand(false);
