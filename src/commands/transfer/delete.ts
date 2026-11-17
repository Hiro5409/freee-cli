import { define } from "gunshi";
import { args, integer, merge, required } from "gunshi/combinators";

import { dryRunArgs } from "../../global-args.ts";
import { initCommand } from "../../helpers.ts";
import { dryRunOutput } from "../../output/dry-run.ts";
import { destroyTransfer } from "../../types/freee/sdk.gen.ts";

export const transferDeleteCommand = define({
  name: "delete",
  description: "Delete an account transfer",
  args: merge(
    dryRunArgs,
    args({
      id: required(integer({ min: 1, max: Number.MAX_SAFE_INTEGER, description: "Transfer ID" })),
    }),
  ),
  examples: `$ freee transfer delete --id 42 --dry-run`,
  run: async (ctx) => {
    const { companyId } = initCommand(ctx);
    const id = ctx.values.id;
    if (ctx.values["dry-run"]) {
      return dryRunOutput({
        method: "DELETE",
        path: `/api/1/transfers/${id}`,
        query: { company_id: companyId },
      });
    }
    await destroyTransfer({ path: { id }, query: { company_id: companyId } });
    return JSON.stringify({ id, deleted: true });
  },
});
