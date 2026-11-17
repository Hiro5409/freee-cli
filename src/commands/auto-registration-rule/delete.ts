import { define } from "gunshi";
import { args, integer, merge, required } from "gunshi/combinators";

import { dryRunArgs } from "../../global-args.ts";
import { initCommand } from "../../helpers.ts";
import { dryRunOutput } from "../../output/dry-run.ts";
import { destroyUserMatcher } from "../../types/freee/sdk.gen.ts";

export const autoRegistrationRuleDeleteCommand = define({
  name: "delete",
  description: "Delete an auto-registration rule; use --dry-run to preview",
  args: merge(
    dryRunArgs,
    args({
      id: required(
        integer({ min: 1, max: Number.MAX_SAFE_INTEGER, description: "Auto-registration rule ID" }),
      ),
    }),
  ),
  examples: `$ freee auto-rule delete --id 42 --dry-run`,
  run: async (ctx) => {
    const { companyId } = initCommand(ctx);
    const id = ctx.values.id;

    if (ctx.values["dry-run"]) {
      return dryRunOutput({
        method: "DELETE",
        path: `/api/1/user_matchers/${id}`,
        query: { company_id: companyId },
      });
    }

    await destroyUserMatcher({ path: { id }, query: { company_id: companyId } });

    return JSON.stringify({ id, deleted: true });
  },
});
