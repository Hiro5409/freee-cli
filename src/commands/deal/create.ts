import { define } from "gunshi";
import { args, choice, integer, merge, required, string } from "gunshi/combinators";
import colors from "yoctocolors";

import { isoDateArg } from "../../cli-input.ts";
import { companyArgs } from "../../global-args.ts";
import { initCommand } from "../../helpers.ts";
import { formatValue } from "../../output/formatter.ts";
import { createDeal } from "../../types/freee/sdk.gen.ts";

export const dealCreateCommand = define({
  name: "deal-create",
  description: "Create a new deal (transaction)",
  args: merge(
    companyArgs,
    args({
      date: required(isoDateArg("--date", "Issue date (YYYY-MM-DD)")),
      type: required(choice(["income", "expense"] as const, { description: "income or expense" })),
      "account-item-id": required(
        integer({ min: 1, max: Number.MAX_SAFE_INTEGER, description: "Account item ID" }),
      ),
      "tax-code": required(
        integer({ min: 0, max: Number.MAX_SAFE_INTEGER, description: "Tax code" }),
      ),
      amount: required(
        integer({
          min: Number.MIN_SAFE_INTEGER,
          max: Number.MAX_SAFE_INTEGER,
          description: "Amount",
        }),
      ),
      "partner-id": integer({ min: 1, max: Number.MAX_SAFE_INTEGER, description: "Partner ID" }),
      description: string({ description: "Remarks/description" }),
    }),
  ),
  examples: `$ freee deal-create --company-id 123 --date 2026-08-01 --type expense \\
    --account-item-id 101 --tax-code 21 --amount 5000 --format json`,
  run: async (ctx) => {
    const { companyId, format } = initCommand(ctx);
    const body = {
      company_id: companyId,
      issue_date: ctx.values.date,
      type: ctx.values.type,
      details: [
        {
          account_item_id: ctx.values["account-item-id"],
          tax_code: ctx.values["tax-code"],
          amount: ctx.values.amount,
          description: ctx.values.description ?? "",
        },
      ],
      partner_id: ctx.values["partner-id"],
    };

    const { data } = await createDeal({ body });
    return formatValue(
      data.deal,
      format,
      `${colors.green("Deal created:")} ${JSON.stringify(data.deal, null, 2)}`,
    );
  },
});
