import { define } from "gunshi";
import colors from "yoctocolors";

import { writeArgs } from "../../global-args.ts";
import { initCommand, parsePositiveId } from "../../helpers.ts";
import { formatDryRun } from "../../output/formatter.ts";
import { getUserMatcher, updateUserMatcher } from "../../types/freee/sdk.gen.ts";
import type {
  GetUserMatcherResponses,
  UpdateUserMatcherData,
} from "../../types/freee/types.gen.ts";

type UpdateBody = UpdateUserMatcherData["body"];

/**
 * Every key of the PUT body, required at the type level so the return value
 * below must name them all. When SDK regeneration adds a mutable field, this
 * fails compilation instead of silently resetting that field on every PUT.
 */
type FullUpdateBody = { [K in keyof Required<UpdateBody>]: UpdateBody[K] };

/**
 * freee replaces the whole rule on PUT, so pick every mutable field from the
 * current state and change only `active`. Read-only fields (id, tax_code,
 * updated_at, correction stats, …) must not be resent.
 */
function buildUserMatcherUpdateBody(
  current: GetUserMatcherResponses[200],
  active: boolean,
): UpdateBody {
  return {
    act: current.act,
    active,
    condition: current.condition,
    description: current.description,
    entry_side_str: current.entry_side_str,
    priority: current.priority,
    tax_name: current.tax_name,
    walletable: current.walletable,
    card_label: current.card_label,
    card_label_id: current.card_label_id,
    transfer_walletable: current.transfer_walletable,
    min_amount: current.min_amount,
    max_amount: current.max_amount,
    deal_description: current.deal_description,
    qualified_invoice_setting: current.qualified_invoice_setting,
    suggest_tax_from_walletable_invoice: current.suggest_tax_from_walletable_invoice,
    account_item_name: current.account_item_name,
    partner_name: current.partner_name,
    item_name: current.item_name,
    section_name: current.section_name,
    division_tag_1_name: current.division_tag_1_name,
    division_tag_2_name: current.division_tag_2_name,
    division_tag_3_name: current.division_tag_3_name,
    default_tag_names: current.default_tag_names,
  } satisfies FullUpdateBody;
}

function defineSetActiveCommand(active: boolean) {
  const verb = active ? "enable" : "disable";
  return define({
    name: `auto-rule-${verb}`,
    description: `${active ? "Enable" : "Disable"} an auto-registration rule (fetch, then full-state PUT with only active changed)`,
    args: {
      ...writeArgs,
      id: { type: "string" as const, description: "Auto rule ID", required: true },
    },
    examples: `$ freee auto-rule-${verb} --id 42 --dry-run --format json`,
    run: async (ctx) => {
      const { companyId, format } = initCommand(ctx);
      const id = parsePositiveId(ctx.values.id, "--id");

      const { data: current } = await getUserMatcher({
        path: { id },
        query: { company_id: companyId },
      });
      const body = buildUserMatcherUpdateBody(current, active);

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
      return colors.green(`Auto rule ${verb}d: id=${data.id} active=${data.active}`);
    },
  });
}

export const autoRuleEnableCommand = defineSetActiveCommand(true);
export const autoRuleDisableCommand = defineSetActiveCommand(false);
