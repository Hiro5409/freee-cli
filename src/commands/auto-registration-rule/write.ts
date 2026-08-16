import { define } from "gunshi";
import colors from "yoctocolors";

import { CliError, errorHints } from "../../errors.ts";
import { writeArgs } from "../../global-args.ts";
import {
  initCommand,
  parseChoice,
  parseInteger,
  parseNonNegativeInteger,
  parsePositiveId,
} from "../../helpers.ts";
import { formatDryRun } from "../../output/formatter.ts";
import { createUserMatcher, getUserMatcher, updateUserMatcher } from "../../types/freee/sdk.gen.ts";
import type { CreateUserMatcherData, UpdateUserMatcherData } from "../../types/freee/types.gen.ts";
import { currentRuleBody } from "./rule-body.ts";

const ACTS = [
  "manual-standard",
  "auto-standard",
  "manual-transfer",
  "auto-transfer",
  "auto-ignore",
  "manual-ignore",
  "manual-private",
  "auto-private",
] as const;
const ACT_CODES = {
  "manual-standard": 0,
  "auto-standard": 1,
  "manual-transfer": 2,
  "auto-transfer": 3,
  "auto-ignore": 4,
  "manual-ignore": 10,
  "manual-private": 11,
  "auto-private": 12,
} as const satisfies Record<(typeof ACTS)[number], CreateUserMatcherData["body"]["act"]>;
const CONDITIONS = ["partial", "forward", "backward", "exact", "wildcard"] as const;
const CONDITION_CODES = {
  partial: 0,
  forward: 1,
  backward: 2,
  exact: 3,
  wildcard: 4,
} as const satisfies Record<(typeof CONDITIONS)[number], number>;
const ENTRY_SIDES = ["income", "expense"] as const;

const ruleArgs = {
  act: { type: "string" as const, description: `Rule action: ${ACTS.join(" | ")}` },
  description: {
    type: "string" as const,
    description: "Text the wallet transaction description is matched against",
  },
  condition: {
    type: "string" as const,
    description: `Match condition: ${CONDITIONS.join(" | ")}`,
  },
  "entry-side": { type: "string" as const, description: "income or expense" },
  priority: { type: "string" as const, description: "Rule priority (non-negative integer)" },
  "tax-name": { type: "string" as const, description: "Tax category name" },
  "account-item-name": { type: "string" as const, description: "Account item name" },
  walletable: { type: "string" as const, description: "Limit the rule to this account name" },
  "card-label": { type: "string" as const, description: "Limit the rule to this card label" },
  "card-label-id": { type: "string" as const, description: "Card label ID" },
  "transfer-walletable": {
    type: "string" as const,
    description: "Destination account for transfer rules",
  },
  "min-amount": { type: "string" as const, description: "Minimum amount (integer yen)" },
  "max-amount": { type: "string" as const, description: "Maximum amount (integer yen)" },
  "deal-description": { type: "string" as const, description: "Remarks written on the deal" },
  "partner-name": { type: "string" as const, description: "Partner name set on the deal" },
  "item-name": { type: "string" as const, description: "Item name set on the deal" },
  "section-name": { type: "string" as const, description: "Section name set on the deal" },
  "default-tag": {
    type: "string" as const,
    multiple: true as const,
    description: "Memo tag set on the deal, repeatable",
  },
};

type UpdateBody = UpdateUserMatcherData["body"];
type RuleValues = {
  act?: string;
  description?: string;
  condition?: string;
  "entry-side"?: string;
  priority?: string;
  "tax-name"?: string;
  "account-item-name"?: string;
  walletable?: string;
  "card-label"?: string;
  "card-label-id"?: string;
  "transfer-walletable"?: string;
  "min-amount"?: string;
  "max-amount"?: string;
  "deal-description"?: string;
  "partner-name"?: string;
  "item-name"?: string;
  "section-name"?: string;
  "default-tag"?: string[];
};

function optionalOverrides(values: RuleValues): Partial<UpdateBody> {
  const overrides: Partial<UpdateBody> = {};
  if (values.act !== undefined) {
    overrides.act = ACT_CODES[parseChoice(values.act, ACTS, "--act")];
  }
  if (values.description !== undefined) overrides.description = values.description;
  if (values.condition !== undefined) {
    overrides.condition = CONDITION_CODES[parseChoice(values.condition, CONDITIONS, "--condition")];
  }
  if (values["entry-side"] !== undefined) {
    overrides.entry_side_str = parseChoice(values["entry-side"], ENTRY_SIDES, "--entry-side");
  }
  if (values.priority !== undefined) {
    overrides.priority = parseNonNegativeInteger(values.priority, "--priority");
  }
  if (values["tax-name"] !== undefined) overrides.tax_name = values["tax-name"];
  if (values["account-item-name"] !== undefined) {
    overrides.account_item_name = values["account-item-name"];
  }
  if (values.walletable !== undefined) overrides.walletable = values.walletable;
  if (values["card-label"] !== undefined) overrides.card_label = values["card-label"];
  if (values["card-label-id"] !== undefined) {
    overrides.card_label_id = parsePositiveId(values["card-label-id"], "--card-label-id");
  }
  if (values["transfer-walletable"] !== undefined) {
    overrides.transfer_walletable = values["transfer-walletable"];
  }
  if (values["min-amount"] !== undefined) {
    overrides.min_amount = parseInteger(values["min-amount"], "--min-amount");
  }
  if (values["max-amount"] !== undefined) {
    overrides.max_amount = parseInteger(values["max-amount"], "--max-amount");
  }
  if (values["deal-description"] !== undefined) {
    overrides.deal_description = values["deal-description"];
  }
  if (values["partner-name"] !== undefined) overrides.partner_name = values["partner-name"];
  if (values["item-name"] !== undefined) overrides.item_name = values["item-name"];
  if (values["section-name"] !== undefined) overrides.section_name = values["section-name"];
  if (values["default-tag"] !== undefined) {
    overrides.default_tag_names = values["default-tag"];
  }
  return overrides;
}

function validateBody(body: UpdateBody): void {
  if ((body.act === 0 || body.act === 1) && (!body.tax_name || !body.account_item_name)) {
    throw new CliError("Standard rules require --tax-name and --account-item-name.", {
      code: "INVALID_INPUT",
      why: "freee cannot create a deal rule without its booking fields.",
      hint: errorHints.invalidValue,
    });
  }
  if ((body.act === 2 || body.act === 3) && !body.transfer_walletable) {
    throw new CliError("Transfer rules require --transfer-walletable.", {
      code: "INVALID_INPUT",
      why: "freee needs a destination account for transfer rules.",
      hint: errorHints.invalidValue,
    });
  }
  if (
    typeof body.min_amount === "number" &&
    typeof body.max_amount === "number" &&
    body.min_amount > body.max_amount
  ) {
    throw new CliError("--min-amount must not exceed --max-amount.", {
      code: "INVALID_INPUT",
      why: "An empty amount range would never match a wallet transaction.",
      hint: errorHints.invalidValue,
    });
  }
}

export const autoRegistrationRuleCreateCommand = define({
  name: "auto-rule-create",
  description: "Create an auto-registration rule",
  args: {
    ...writeArgs,
    ...ruleArgs,
    act: { ...ruleArgs.act, required: true },
    description: { ...ruleArgs.description, required: true },
    condition: { ...ruleArgs.condition, required: true },
    "entry-side": { ...ruleArgs["entry-side"], required: true },
    priority: { ...ruleArgs.priority, required: true },
  },
  examples: `$ freee auto-rule-create --act manual-transfer --description 振込 --condition exact \\
    --entry-side expense --priority 5 --transfer-walletable 普通預金 --dry-run --format json`,
  run: async (ctx) => {
    const { companyId, format } = initCommand(ctx);
    const body = {
      ...optionalOverrides(ctx.values),
      act: ACT_CODES[parseChoice(ctx.values.act, ACTS, "--act")],
      active: true,
      condition: CONDITION_CODES[parseChoice(ctx.values.condition, CONDITIONS, "--condition")],
      description: ctx.values.description,
      entry_side_str: parseChoice(ctx.values["entry-side"], ENTRY_SIDES, "--entry-side"),
      priority: parseNonNegativeInteger(ctx.values.priority, "--priority"),
    } satisfies CreateUserMatcherData["body"];
    validateBody(body);

    if (ctx.values["dry-run"]) {
      return formatDryRun(
        format,
        { method: "POST", path: "/api/1/user_matchers", query: { company_id: companyId }, body },
        `${colors.yellow("Dry run —")} would POST /api/1/user_matchers: ${JSON.stringify(body, null, 2)}`,
      );
    }

    const { data } = await createUserMatcher({ query: { company_id: companyId }, body });
    if (format === "json") return JSON.stringify(data, null, 2);
    return colors.green(`Auto-registration rule created: id=${data.id} act=${data.act}`);
  },
});

export const autoRegistrationRuleUpdateCommand = define({
  name: "auto-rule-update",
  description: "Update selected fields of an auto-registration rule",
  args: {
    ...writeArgs,
    ...ruleArgs,
    id: { type: "string" as const, description: "Auto-registration rule ID", required: true },
  },
  examples: `$ freee auto-rule-update --id 42 --account-item-name 通信費 \\
    --deal-description 開発用サービス --dry-run --format json`,
  run: async (ctx) => {
    const { companyId, format } = initCommand(ctx);
    const id = parsePositiveId(ctx.values.id, "--id");
    const overrides = optionalOverrides(ctx.values);
    if (Object.keys(overrides).length === 0) {
      throw new CliError("Pass at least one rule field to update.", {
        code: "INVALID_INPUT",
        why: "A full-state PUT with no requested change is a no-op.",
        hint: errorHints.invalidValue,
      });
    }

    const { data: current } = await getUserMatcher({
      path: { id },
      query: { company_id: companyId },
    });
    const body: UpdateBody = { ...currentRuleBody(current), ...overrides };
    validateBody(body);

    if (ctx.values["dry-run"]) {
      return formatDryRun(
        format,
        {
          method: "PUT",
          path: `/api/1/user_matchers/${id}`,
          query: { company_id: companyId },
          body,
        },
        `${colors.yellow("Dry run —")} would PUT /api/1/user_matchers/${id}: ${JSON.stringify(body, null, 2)}`,
      );
    }

    const { data } = await updateUserMatcher({
      path: { id },
      query: { company_id: companyId },
      body,
    });
    if (format === "json") return JSON.stringify(data, null, 2);
    return colors.green(`Auto-registration rule updated: id=${data.id} act=${data.act}`);
  },
});
