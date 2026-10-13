import { define } from "gunshi";
import { args, integer, merge, required } from "gunshi/combinators";
import colors from "yoctocolors";

import { dryRunArgs } from "../../global-args.ts";
import { initCommand } from "../../helpers.ts";
import { formatDryRun } from "../../output/formatter.ts";
import { destroyTransfer } from "../../types/freee/sdk.gen.ts";

export const transferDeleteCommand = define({
  name: "transfer-delete",
  description: "Delete an account transfer",
  args: merge(
    dryRunArgs,
    args({
      id: required(integer({ min: 1, max: Number.MAX_SAFE_INTEGER, description: "Transfer ID" })),
    }),
  ),
  examples: `$ freee transfer-delete --id 42 --dry-run --format json`,
  run: async (ctx) => {
    const { companyId, format } = initCommand(ctx);
    const id = ctx.values.id;
    if (ctx.values["dry-run"]) {
      return formatDryRun(
        format,
        {
          method: "DELETE",
          path: `/api/1/transfers/${id}`,
          query: { company_id: companyId },
        },
        `${colors.yellow("Dry run —")} would DELETE /api/1/transfers/${id} (company_id=${companyId})`,
      );
    }
    await destroyTransfer({ path: { id }, query: { company_id: companyId } });
    if (format === "json") return JSON.stringify({ id, deleted: true }, null, 2);
    return colors.green(`Transfer deleted: id=${id}`);
  },
});
