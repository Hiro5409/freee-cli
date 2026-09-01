import { define } from "gunshi";
import colors from "yoctocolors";

import {
  IntegerTextSchema,
  IsoDateSchema,
  NonNegativeIntegerTextSchema,
  PositiveIntegerTextSchema,
  parseCliInput,
} from "../../cli-input.ts";
import { CliError } from "../../errors.ts";
import { companyArgs } from "../../global-args.ts";
import { initCommand } from "../../helpers.ts";
import { formatValue } from "../../output/formatter.ts";
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
    ...companyArgs,
    date: { type: "string" as const, description: "Issue date (YYYY-MM-DD)", required: true },
    type: { type: "string" as const, description: "income or expense", required: true },
    "account-item-id": { type: "string" as const, description: "Account item ID", required: true },
    "tax-code": { type: "string" as const, description: "Tax code", required: true },
    amount: { type: "string" as const, description: "Amount", required: true },
    "partner-id": { type: "string" as const, description: "Partner ID" },
    description: { type: "string" as const, description: "Remarks/description" },
  },
  examples: `$ freee deal-create --company-id 123 --date 2026-08-01 --type expense \\
    --account-item-id 101 --tax-code 21 --amount 5000 --format json`,
  run: async (ctx) => {
    const { companyId, format } = initCommand(ctx);
    const body = {
      company_id: companyId,
      issue_date: parseCliInput(IsoDateSchema, ctx.values.date, { label: "--date" }),
      type: parseDealType(ctx.values.type),
      details: [
        {
          account_item_id: parseCliInput(PositiveIntegerTextSchema, ctx.values["account-item-id"], {
            label: "--account-item-id",
          }),
          tax_code: parseCliInput(NonNegativeIntegerTextSchema, ctx.values["tax-code"], {
            label: "--tax-code",
          }),
          amount: parseCliInput(IntegerTextSchema, ctx.values.amount, { label: "--amount" }),
          description: ctx.values.description ?? "",
        },
      ],
      partner_id: ctx.values["partner-id"]
        ? parseCliInput(PositiveIntegerTextSchema, ctx.values["partner-id"], {
            label: "--partner-id",
          })
        : undefined,
    };

    const { data } = await createDeal({ body });
    return formatValue(
      data.deal,
      format,
      `${colors.green("Deal created:")} ${JSON.stringify(data.deal, null, 2)}`,
    );
  },
});
