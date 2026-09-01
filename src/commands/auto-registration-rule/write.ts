import { define, type ArgValues } from "gunshi";
import colors from "yoctocolors";

import {
  IntegerTextSchema,
  NonNegativeIntegerTextSchema,
  PositiveIntegerTextSchema,
  parseCliInput,
} from "../../cli-input.ts";
import { CliError, errorHints } from "../../errors.ts";
import { dryRunArgs } from "../../global-args.ts";
import { initCommand } from "../../helpers.ts";
import { formatDryRun } from "../../output/formatter.ts";
import { createUserMatcher, getUserMatcher, updateUserMatcher } from "../../types/freee/sdk.gen.ts";
import type { CreateUserMatcherData, UpdateUserMatcherData } from "../../types/freee/types.gen.ts";
import { currentRuleBody } from "./rule-body.ts";

type CreateBody = CreateUserMatcherData["body"];
type UpdateBody = UpdateUserMatcherData["body"];
type WritableRuleBody = CreateBody & UpdateBody;

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
const QUALIFIED_INVOICE_SETTINGS = ["non-qualified", "qualified", "depends-on-partner"] as const;
const QUALIFIED_INVOICE_SETTING_CODES = {
  "non-qualified": "non_qualified",
  qualified: "qualified",
  "depends-on-partner": "depends_on_partner",
} as const satisfies Record<
  (typeof QUALIFIED_INVOICE_SETTINGS)[number],
  NonNullable<CreateBody["qualified_invoice_setting"]>
>;

const ruleArgs = {
  act: {
    type: "enum" as const,
    choices: ACTS,
    description: `Rule action: ${ACTS.join(" | ")}`,
  },
  description: {
    type: "string" as const,
    description: "Text the wallet transaction description is matched against",
  },
  condition: {
    type: "enum" as const,
    choices: CONDITIONS,
    description: `Match condition: ${CONDITIONS.join(" | ")}`,
  },
  "entry-side": {
    type: "enum" as const,
    choices: ENTRY_SIDES,
    description: "income or expense",
  },
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
  "qualified-invoice-setting": {
    type: "enum" as const,
    choices: QUALIFIED_INVOICE_SETTINGS,
    description: `Invoice qualification: ${QUALIFIED_INVOICE_SETTINGS.join(" | ")}`,
  },
  "suggest-tax-from-walletable-invoice": {
    type: "boolean" as const,
    negatable: true as const,
    description: "Use the tax category from supported wallet purchase data",
  },
  "division-tag-1-name": { type: "string" as const, description: "Segment 1 tag name" },
  "division-tag-2-name": { type: "string" as const, description: "Segment 2 tag name" },
  "division-tag-3-name": { type: "string" as const, description: "Segment 3 tag name" },
  "default-tag": {
    type: "string" as const,
    multiple: true as const,
    description: "Memo tag set on the deal, repeatable",
  },
};

type NullableUpdateKey = {
  [K in keyof UpdateBody]-?: null extends UpdateBody[K] ? K : never;
}[keyof UpdateBody];

function defineClearableFields<const Fields extends Record<string, NullableUpdateKey>>(
  fields: Exclude<NullableUpdateKey, Fields[keyof Fields]> extends never ? Fields : never,
): Fields {
  return fields;
}

const CLEARABLE_FIELD_NAMES = [
  "tax-name",
  "account-item-name",
  "walletable",
  "card-label",
  "card-label-id",
  "transfer-walletable",
  "min-amount",
  "max-amount",
  "deal-description",
  "partner-name",
  "item-name",
  "section-name",
  "qualified-invoice-setting",
  "suggest-tax-from-walletable-invoice",
  "division-tag-1-name",
  "division-tag-2-name",
  "division-tag-3-name",
  "default-tag",
] as const;
const CLEARABLE_FIELDS = defineClearableFields({
  "tax-name": "tax_name",
  "account-item-name": "account_item_name",
  walletable: "walletable",
  "card-label": "card_label",
  "card-label-id": "card_label_id",
  "transfer-walletable": "transfer_walletable",
  "min-amount": "min_amount",
  "max-amount": "max_amount",
  "deal-description": "deal_description",
  "partner-name": "partner_name",
  "item-name": "item_name",
  "section-name": "section_name",
  "qualified-invoice-setting": "qualified_invoice_setting",
  "suggest-tax-from-walletable-invoice": "suggest_tax_from_walletable_invoice",
  "division-tag-1-name": "division_tag_1_name",
  "division-tag-2-name": "division_tag_2_name",
  "division-tag-3-name": "division_tag_3_name",
  "default-tag": "default_tag_names",
} satisfies Record<(typeof CLEARABLE_FIELD_NAMES)[number], NullableUpdateKey>);

type RuleValues = ArgValues<typeof ruleArgs>;
type OptionalKey<T> = {
  [K in keyof T]-?: object extends Pick<T, K> ? K : never;
}[keyof T];
type SettableKey = OptionalKey<WritableRuleBody>;
type SettableField<K extends SettableKey> = (values: RuleValues) => WritableRuleBody[K];

const SETTABLE_FIELDS = {
  tax_name: (values) => values["tax-name"],
  walletable: (values) => values.walletable,
  card_label: (values) => values["card-label"],
  card_label_id: (values) =>
    values["card-label-id"] === undefined
      ? undefined
      : parseCliInput(PositiveIntegerTextSchema, values["card-label-id"], {
          label: "--card-label-id",
        }),
  transfer_walletable: (values) => values["transfer-walletable"],
  min_amount: (values) =>
    values["min-amount"] === undefined
      ? undefined
      : parseCliInput(IntegerTextSchema, values["min-amount"], { label: "--min-amount" }),
  max_amount: (values) =>
    values["max-amount"] === undefined
      ? undefined
      : parseCliInput(IntegerTextSchema, values["max-amount"], { label: "--max-amount" }),
  deal_description: (values) => values["deal-description"],
  qualified_invoice_setting: (values) => {
    const setting = values["qualified-invoice-setting"];
    return setting === undefined ? undefined : QUALIFIED_INVOICE_SETTING_CODES[setting];
  },
  suggest_tax_from_walletable_invoice: (values) => values["suggest-tax-from-walletable-invoice"],
  account_item_name: (values) => values["account-item-name"],
  partner_name: (values) => values["partner-name"],
  item_name: (values) => values["item-name"],
  section_name: (values) => values["section-name"],
  division_tag_1_name: (values) => values["division-tag-1-name"],
  division_tag_2_name: (values) => values["division-tag-2-name"],
  division_tag_3_name: (values) => values["division-tag-3-name"],
  default_tag_names: (values) => values["default-tag"],
} satisfies { [K in SettableKey]: SettableField<K> };

function clearOverrides(
  fields: Array<(typeof CLEARABLE_FIELD_NAMES)[number]> | undefined,
): Partial<UpdateBody> {
  const overrides: Partial<UpdateBody> = {};
  for (const name of fields ?? []) {
    overrides[CLEARABLE_FIELDS[name]] = null;
  }
  return overrides;
}

function optionalOverrides(values: RuleValues): Partial<WritableRuleBody> {
  const overrides: Partial<WritableRuleBody> = {};
  if (values.act !== undefined) {
    overrides.act = ACT_CODES[values.act];
  }
  if (values.description !== undefined) overrides.description = values.description;
  if (values.condition !== undefined) {
    overrides.condition = CONDITION_CODES[values.condition];
  }
  if (values["entry-side"] !== undefined) {
    overrides.entry_side_str = values["entry-side"];
  }
  if (values.priority !== undefined) {
    overrides.priority = parseCliInput(NonNegativeIntegerTextSchema, values.priority, {
      label: "--priority",
    });
  }
  for (const [key, read] of Object.entries(SETTABLE_FIELDS)) {
    const value = read(values);
    if (value !== undefined) Object.assign(overrides, { [key]: value });
  }
  return overrides;
}

function isStandardAct(act: UpdateBody["act"]): boolean {
  return act === 0 || act === 1;
}

function validateBody(body: UpdateBody): void {
  if (isStandardAct(body.act) && (!body.tax_name || !body.account_item_name)) {
    throw new CliError("Standard rules require --tax-name and --account-item-name.", {
      code: "INVALID_INPUT",
      why: "freee cannot create a deal rule without its booking fields.",
      hint: errorHints.invalidValue,
    });
  }
  if (
    isStandardAct(body.act) &&
    (body.qualified_invoice_setting === undefined || body.qualified_invoice_setting === null)
  ) {
    throw new CliError("Standard rules require --qualified-invoice-setting.", {
      code: "INVALID_INPUT",
      why: "freee otherwise assigns an invoice qualification without an explicit CLI choice.",
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
    isStandardAct(body.act) &&
    body.qualified_invoice_setting === "depends_on_partner" &&
    !body.partner_name
  ) {
    throw new CliError("The depends-on-partner invoice setting requires --partner-name.", {
      code: "INVALID_INPUT",
      why: "freee needs a partner to determine invoice qualification.",
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
    ...dryRunArgs,
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
      act: ACT_CODES[ctx.values.act],
      active: true,
      condition: CONDITION_CODES[ctx.values.condition],
      description: ctx.values.description,
      entry_side_str: ctx.values["entry-side"],
      priority: parseCliInput(NonNegativeIntegerTextSchema, ctx.values.priority, {
        label: "--priority",
      }),
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
    ...dryRunArgs,
    ...ruleArgs,
    id: { type: "string" as const, description: "Auto-registration rule ID", required: true },
    clear: {
      type: "enum" as const,
      choices: CLEARABLE_FIELD_NAMES,
      multiple: true as const,
      description: `Clear an optional field by sending JSON null, repeatable: ${CLEARABLE_FIELD_NAMES.join(" | ")}`,
    },
  },
  examples: `$ freee auto-rule-update --id 42 --account-item-name 通信費 \\
    --deal-description 開発用サービス --dry-run --format json
$ freee auto-rule-update --id 42 --clear walletable --dry-run --format json`,
  run: async (ctx) => {
    const { companyId, format } = initCommand(ctx);
    const id = parseCliInput(PositiveIntegerTextSchema, ctx.values.id, { label: "--id" });
    const valueOverrides = optionalOverrides(ctx.values);
    const clearedOverrides = clearOverrides(ctx.values.clear);
    const conflictingField = CLEARABLE_FIELD_NAMES.find(
      (name) =>
        CLEARABLE_FIELDS[name] in valueOverrides && CLEARABLE_FIELDS[name] in clearedOverrides,
    );
    if (conflictingField) {
      throw new CliError(`--${conflictingField} cannot be both set and cleared.`, {
        code: "INVALID_INPUT",
        why: "The requested final value would be ambiguous.",
        hint: errorHints.invalidValue,
      });
    }
    const overrides = { ...valueOverrides, ...clearedOverrides };
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
    if (
      !isStandardAct(current.act) &&
      isStandardAct(body.act) &&
      !("qualified_invoice_setting" in valueOverrides)
    ) {
      throw new CliError("Changing to a standard rule requires --qualified-invoice-setting.", {
        code: "INVALID_INPUT",
        why: "An invoice setting retained from a non-standard rule was not an explicit choice for the new action.",
        hint: errorHints.invalidValue,
      });
    }
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
