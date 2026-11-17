import { define } from "gunshi";
import { args, integer, merge, required } from "gunshi/combinators";

import { dryRunArgs } from "../../global-args.ts";
import { initCommand } from "../../helpers.ts";
import { dryRunOutput } from "../../output/dry-run.ts";
import { destroyReceipt } from "../../types/freee/sdk.gen.ts";

export const fileBoxDeleteCommand = define({
  name: "delete",
  description: "Delete a document from the File Box",
  args: merge(
    dryRunArgs,
    args({
      id: required(
        integer({ min: 1, max: Number.MAX_SAFE_INTEGER, description: "File Box document ID" }),
      ),
    }),
  ),
  examples: `$ freee file-box delete --id 55 --dry-run`,
  run: async (ctx) => {
    const { companyId } = initCommand(ctx);
    const id = ctx.values.id;
    const query = { company_id: companyId };
    const path = `/api/1/receipts/${id}`;

    if (ctx.values["dry-run"]) {
      return dryRunOutput({ method: "DELETE", path, query });
    }

    await destroyReceipt({ path: { id }, query });
    return JSON.stringify({ id, deleted: true });
  },
});
