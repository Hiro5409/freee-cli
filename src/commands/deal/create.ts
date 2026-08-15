import { define } from "gunshi";
import colors from "yoctocolors";

import { CliError } from "../../errors.ts";
import { writeArgs } from "../../global-args.ts";
import {
  initCommand,
  parseDate,
  parseInteger,
  parseNonNegativeInteger,
  parsePositiveId,
} from "../../helpers.ts";
import { formatDryRun, formatValue } from "../../output/formatter.ts";
import { createDeal } from "../../types/freee/sdk.gen.ts";

function parseDealType(value: unknown): "income" | "expense" {
  if (value === "income" || value === "expense") return value;
  throw new CliError(`--type must be "income" or "expense", got "${value}"`, {
    code: "INVALID_INPUT",
  });
}

export const dealCreateCommand = define({
  name: "deal-create",
  description: "Create a new deal (transaction)",
  args: {
    ...writeArgs,
    date: { type: "string" as const, description: "Issue date (YYYY-MM-DD)", required: true },
    type: { type: "string" as const, description: "income or expense", required: true },
    "account-item-id": { type: "string" as const, description: "Account item ID", required: true },
    "tax-code": { type: "string" as const, description: "Tax code", required: true },
    amount: { type: "string" as const, description: "Amount", required: true },
    "partner-id": { type: "string" as const, description: "Partner ID" },
    description: { type: "string" as const, description: "Remarks/description" },
  },
  examples: `# Preview the request before writing
$ freee deal-create --company-id 123 --date 2026-08-01 --type expense \\
    --account-item-id 101 --tax-code 21 --amount 5000 --dry-run --format json`,
  run: async (ctx) => {
    const { companyId, format } = initCommand(ctx);
    const body = {
      company_id: companyId,
      issue_date: parseDate(ctx.values.date, "--date"),
      type: parseDealType(ctx.values.type),
      details: [
        {
          account_item_id: parsePositiveId(ctx.values["account-item-id"], "--account-item-id"),
          tax_code: parseNonNegativeInteger(ctx.values["tax-code"], "--tax-code"),
          amount: parseInteger(ctx.values.amount, "--amount"),
          description: ctx.values.description ?? "",
        },
      ],
      partner_id: ctx.values["partner-id"]
        ? parsePositiveId(ctx.values["partner-id"], "--partner-id")
        : undefined,
    };

    if (ctx.values["dry-run"]) {
      return formatDryRun(
        format,
        { method: "POST", path: "/api/1/deals", body },
        `${colors.yellow("Dry run —")} would create deal: ${JSON.stringify(body, null, 2)}`,
      );
    }

    const { data } = await createDeal({ body });
    return formatValue(
      data.deal,
      format,
      `${colors.green("Deal created:")} ${JSON.stringify(data.deal, null, 2)}`,
    );
  },
});
