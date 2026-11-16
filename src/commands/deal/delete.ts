import { define } from "gunshi";
import { args, integer, merge, required } from "gunshi/combinators";

import { dryRunArgs } from "../../global-args.ts";
import { initCommand } from "../../helpers.ts";
import { dryRunOutput } from "../../output/dry-run.ts";
import { destroyDeal } from "../../types/freee/sdk.gen.ts";

export const dealDeleteCommand = define({
  name: "delete",
  description: "Delete a deal (transaction)",
  args: merge(
    dryRunArgs,
    args({
      id: required(integer({ min: 1, max: Number.MAX_SAFE_INTEGER, description: "Deal ID" })),
    }),
  ),
  examples: `$ freee deal delete --id 42 --dry-run`,
  run: async (ctx) => {
    const { companyId } = initCommand(ctx);
    const id = ctx.values.id;
    const query = { company_id: companyId };

    if (ctx.values["dry-run"]) {
      return dryRunOutput({ method: "DELETE", path: `/api/1/deals/${id}`, query });
    }

    await destroyDeal({ path: { id }, query });
    return JSON.stringify({ id, deleted: true });
  },
});
