import { define } from "gunshi";
import { args, integer, merge, required } from "gunshi/combinators";

import { dryRunArgs } from "../../global-args.ts";
import { initCommand } from "../../helpers.ts";
import { dryRunOutput } from "../../output/dry-run.ts";
import { getUserMatcher, updateUserMatcher } from "../../types/freee/sdk.gen.ts";
import { currentRuleBody } from "./rule-body.ts";

function defineSetActiveCommand(active: boolean) {
  const verb = active ? "enable" : "disable";
  return define({
    name: `auto-rule-${verb}`,
    description: `${active ? "Enable" : "Disable"} an auto-registration rule`,
    args: merge(
      dryRunArgs,
      args({
        id: required(
          integer({
            min: 1,
            max: Number.MAX_SAFE_INTEGER,
            description: "Auto-registration rule ID",
          }),
        ),
      }),
    ),
    examples: `$ freee auto-rule-${verb} --id 42 --dry-run`,
    run: async (ctx) => {
      const { companyId } = initCommand(ctx);
      const id = ctx.values.id;

      const { data: current } = await getUserMatcher({
        path: { id },
        query: { company_id: companyId },
      });
      const body = { ...currentRuleBody(current), active };

      if (ctx.values["dry-run"]) {
        return dryRunOutput({
          method: "PUT",
          path: `/api/1/user_matchers/${id}`,
          query: { company_id: companyId },
          body,
        });
      }

      const { data } = await updateUserMatcher({
        path: { id },
        query: { company_id: companyId },
        body,
      });

      return JSON.stringify(data);
    },
  });
}

export const autoRegistrationRuleEnableCommand = defineSetActiveCommand(true);
export const autoRegistrationRuleDisableCommand = defineSetActiveCommand(false);
