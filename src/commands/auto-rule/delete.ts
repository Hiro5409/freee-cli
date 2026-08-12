import { define } from "gunshi";
import colors from "yoctocolors";

import { writeArgs } from "../../global-args.ts";
import { initCommand, parsePositiveId } from "../../helpers.ts";
import { formatDryRun } from "../../output/formatter.ts";
import { destroyUserMatcher } from "../../types/freee/sdk.gen.ts";

export const autoRuleDeleteCommand = define({
  name: "auto-rule-delete",
  description: "Delete an auto-registration rule (no confirmation; use --dry-run to preview)",
  args: {
    ...writeArgs,
    id: { type: "string" as const, description: "Auto rule ID", required: true },
  },
  examples: `$ freee auto-rule-delete --id 42 --dry-run --format json`,
  run: async (ctx) => {
    const { companyId, format } = initCommand(ctx);
    const id = parsePositiveId(ctx.values.id, "--id");

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
    return colors.green(`Auto rule deleted: id=${id}`);
  },
});
