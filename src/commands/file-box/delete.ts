import { define } from "gunshi";
import colors from "yoctocolors";

import { PositiveIntegerTextSchema, parseCliInput } from "../../cli-input.ts";
import { dryRunArgs } from "../../global-args.ts";
import { initCommand } from "../../helpers.ts";
import { formatDryRun, formatValue } from "../../output/formatter.ts";
import { destroyReceipt } from "../../types/freee/sdk.gen.ts";

export const fileBoxDeleteCommand = define({
  name: "file-box-delete",
  description: "Delete a document from the File Box",
  args: {
    ...dryRunArgs,
    id: { type: "string" as const, description: "File Box document ID", required: true },
  },
  examples: `$ freee file-box-delete --id 55 --dry-run --format json`,
  run: async (ctx) => {
    const { companyId, format } = initCommand(ctx);
    const id = parseCliInput(PositiveIntegerTextSchema, ctx.values.id, { label: "--id" });
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
