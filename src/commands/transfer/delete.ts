import { define } from "gunshi";
import colors from "yoctocolors";

import { writeArgs } from "../../global-args.ts";
import { initCommand, parsePositiveId } from "../../helpers.ts";
import { formatDryRun } from "../../output/formatter.ts";
import { destroyTransfer } from "../../types/freee/sdk.gen.ts";

export const transferDeleteCommand = define({
  name: "transfer-delete",
  description: "Delete an account transfer",
  args: {
    ...writeArgs,
    id: { type: "string" as const, description: "Transfer ID", required: true },
  },
  examples: `$ freee transfer-delete --id 42 --dry-run --format json`,
  run: async (ctx) => {
    const { companyId, format } = initCommand(ctx);
    const id = parsePositiveId(ctx.values.id, "--id");
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
