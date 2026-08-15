import { define } from "gunshi";
import colors from "yoctocolors";

import { CliError, errorHints } from "../../errors.ts";
import { writeArgs } from "../../global-args.ts";
import { initCommand, parseChoice, parseInteger, parseNonNegativeInteger } from "../../helpers.ts";
import { formatDryRun } from "../../output/formatter.ts";
import { createUserMatcher } from "../../types/freee/sdk.gen.ts";
import type { CreateUserMatcherData } from "../../types/freee/types.gen.ts";

const CONDITIONS = ["partial", "forward", "backward", "exact", "wildcard"] as const;
const CONDITION_CODES = {
  partial: 0,
  forward: 1,
  backward: 2,
  exact: 3,
  wildcard: 4,
} as const satisfies Record<(typeof CONDITIONS)[number], number>;
const ENTRY_SIDES = ["income", "expense"] as const;

export const autoRegistrationRuleCreateDealCommand = define({
  name: "auto-rule-create-deal",
  description: "Create an active rule that registers matching wallet transactions as deals",
  args: {
    ...writeArgs,
    description: {
      type: "string" as const,
      description: "Text the wallet transaction description is matched against",
      required: true,
    },
    condition: {
      type: "string" as const,
      description: `Match condition: ${CONDITIONS.join(" | ")}`,
      required: true,
    },
    "entry-side": {
      type: "string" as const,
      description: "income or expense",
      required: true,
    },
    priority: {
      type: "string" as const,
      description: "Rule priority (non-negative integer)",
      required: true,
    },
    "tax-name": {
      type: "string" as const,
      description: "Tax category name (e.g. 課対仕入10%)",
      required: true,
    },
    "account-item-name": {
      type: "string" as const,
      description: "Account item name (e.g. 消耗品費)",
      required: true,
    },
    walletable: { type: "string" as const, description: "Limit the rule to this account name" },
    "min-amount": { type: "string" as const, description: "Minimum amount to match (integer yen)" },
    "max-amount": { type: "string" as const, description: "Maximum amount to match (integer yen)" },
    "deal-description": {
      type: "string" as const,
      description: "Remarks written on the registered deal",
    },
    "partner-name": { type: "string" as const, description: "Partner name set on the deal" },
    "item-name": { type: "string" as const, description: "Item name set on the deal" },
    "section-name": { type: "string" as const, description: "Section name set on the deal" },
    "default-tag": {
      type: "string" as const,
      multiple: true as const,
      description: "Memo tag set on the deal, repeatable",
    },
  },
  examples: `# AMAZONを含む出金明細を消耗品費として自動登録するルール
$ freee auto-rule-create-deal --description AMAZON --condition partial --entry-side expense \\
    --priority 5 --tax-name 課対仕入10% --account-item-name 消耗品費 --dry-run --format json

# 楽天カードの明細だけに絞り、メモタグを付けて登録
$ freee auto-rule-create-deal --description AMAZON --condition partial --entry-side expense \\
    --priority 5 --tax-name 課対仕入10% --account-item-name 消耗品費 \\
    --walletable 楽天カード --default-tag 経費 --default-tag 自動登録 --dry-run --format json`,
  run: async (ctx) => {
    const { companyId, format } = initCommand(ctx);

    const body: CreateUserMatcherData["body"] = {
      act: 1,
      active: true,
      condition: CONDITION_CODES[parseChoice(ctx.values.condition, CONDITIONS, "--condition")],
      description: ctx.values.description,
      entry_side_str: parseChoice(ctx.values["entry-side"], ENTRY_SIDES, "--entry-side"),
      priority: parseNonNegativeInteger(ctx.values.priority, "--priority"),
      tax_name: ctx.values["tax-name"],
      account_item_name: ctx.values["account-item-name"],
      walletable: ctx.values.walletable,
      min_amount:
        ctx.values["min-amount"] !== undefined
          ? parseInteger(ctx.values["min-amount"], "--min-amount")
          : undefined,
      max_amount:
        ctx.values["max-amount"] !== undefined
          ? parseInteger(ctx.values["max-amount"], "--max-amount")
          : undefined,
      deal_description: ctx.values["deal-description"],
      partner_name: ctx.values["partner-name"],
      item_name: ctx.values["item-name"],
      section_name: ctx.values["section-name"],
      default_tag_names: ctx.values["default-tag"],
    };

    const { min_amount: minAmount, max_amount: maxAmount } = body;
    if (typeof minAmount === "number" && typeof maxAmount === "number" && minAmount > maxAmount) {
      throw new CliError(
        `--min-amount (${minAmount}) must not exceed --max-amount (${maxAmount})`,
        {
          code: "INVALID_INPUT",
          why: "An empty amount range would never match any wallet transaction.",
          hint: errorHints.invalidValue,
        },
      );
    }

    if (ctx.values["dry-run"]) {
      return formatDryRun(
        format,
        {
          method: "POST",
          path: "/api/1/user_matchers",
          query: { company_id: companyId },
          body,
        },
        `${colors.yellow("Dry run —")} would POST /api/1/user_matchers: ${JSON.stringify(body, null, 2)}`,
      );
    }

    const { data } = await createUserMatcher({ query: { company_id: companyId }, body });

    if (format === "json") return JSON.stringify(data, null, 2);
    return [
      colors.green(`Auto-registration rule created: id=${data.id}`),
      `  ${data.entry_side_str} / condition=${ctx.values.condition} / priority=${data.priority}`,
      `  ${data.description} → ${data.account_item_name} (${data.tax_name})`,
    ].join("\n");
  },
});
