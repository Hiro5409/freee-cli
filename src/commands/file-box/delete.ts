import { define } from "gunshi";
import { args, integer, merge, required } from "gunshi/combinators";
import colors from "yoctocolors";

import { dryRunArgs } from "../../global-args.ts";
import { initCommand } from "../../helpers.ts";
import { formatDryRun, formatValue } from "../../output/formatter.ts";
import { destroyReceipt } from "../../types/freee/sdk.gen.ts";

export const fileBoxDeleteCommand = define({
  name: "file-box-delete",
  description: "Delete a document from the File Box",
  args: merge(
    dryRunArgs,
    args({
      id: required(
        integer({ min: 1, max: Number.MAX_SAFE_INTEGER, description: "File Box document ID" }),
      ),
    }),
  ),
  examples: `$ freee file-box-delete --id 55 --dry-run --format json`,
  run: async (ctx) => {
    const { companyId, format } = initCommand(ctx);
    const id = ctx.values.id;
    const query = { company_id: companyId };
    const path = `/api/1/receipts/${id}`;

    if (ctx.values["dry-run"]) {
      return formatDryRun(
        format,
        { method: "DELETE", path, query },
        `${colors.yellow("Dry run —")} would delete File Box document ${id}.`,
      );
    }

    await destroyReceipt({ path: { id }, query });
    return formatValue(
      { id, deleted: true },
      format,
      colors.green(`File Box document ${id} deleted.`),
    );
  },
});
