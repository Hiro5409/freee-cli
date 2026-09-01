import { define } from "gunshi";
import colors from "yoctocolors";

import { PositiveIntegerTextSchema, parseCliInput } from "../../cli-input.ts";
import { dryRunArgs } from "../../global-args.ts";
import { initCommand } from "../../helpers.ts";
import { formatDryRun } from "../../output/formatter.ts";
import { destroyUserMatcher } from "../../types/freee/sdk.gen.ts";

export const autoRegistrationRuleDeleteCommand = define({
  name: "auto-rule-delete",
  description: "Delete an auto-registration rule; use --dry-run to preview",
  args: {
    ...dryRunArgs,
    id: { type: "string" as const, description: "Auto-registration rule ID", required: true },
  },
  examples: `$ freee auto-rule-delete --id 42 --dry-run --format json`,
  run: async (ctx) => {
    const { companyId, format } = initCommand(ctx);
    const id = parseCliInput(PositiveIntegerTextSchema, ctx.values.id, { label: "--id" });

    if (ctx.values["dry-run"]) {
      return formatDryRun(
        format,
        {
          method: "DELETE",
          path: `/api/1/user_matchers/${id}`,
          query: { company_id: companyId },
        },
        `${colors.yellow("Dry run —")} would DELETE /api/1/user_matchers/${id} (company_id=${companyId})`,
      );
    }

    await destroyUserMatcher({ path: { id }, query: { company_id: companyId } });

    if (format === "json") return JSON.stringify({ id, deleted: true }, null, 2);
    return colors.green(`Auto-registration rule deleted: id=${id}`);
  },
});
