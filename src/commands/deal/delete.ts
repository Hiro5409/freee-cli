import { define } from "gunshi";
import { args, integer, merge, required } from "gunshi/combinators";
import colors from "yoctocolors";

import { dryRunArgs } from "../../global-args.ts";
import { initCommand } from "../../helpers.ts";
import { formatDryRun, formatValue } from "../../output/formatter.ts";
import { destroyDeal } from "../../types/freee/sdk.gen.ts";

export const dealDeleteCommand = define({
  name: "deal-delete",
  description: "Delete a deal (transaction)",
  args: merge(
    dryRunArgs,
    args({
      id: required(integer({ min: 1, max: Number.MAX_SAFE_INTEGER, description: "Deal ID" })),
    }),
  ),
  examples: `$ freee deal-delete --id 42 --dry-run --format json`,
  run: async (ctx) => {
    const { companyId, format } = initCommand(ctx);
    const id = ctx.values.id;
    const query = { company_id: companyId };

    if (ctx.values["dry-run"]) {
      return formatDryRun(
        format,
        { method: "DELETE", path: `/api/1/deals/${id}`, query },
        `${colors.yellow("Dry run —")} would delete deal ${id}.`,
      );
    }

    await destroyDeal({ path: { id }, query });
    return formatValue({ id, deleted: true }, format, colors.green(`Deal ${id} deleted.`));
  },
});
