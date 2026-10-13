import type {
  GetUserMatcherResponses,
  UpdateUserMatcherData,
} from "../../types/freee/types.gen.ts";

type UpdateBody = UpdateUserMatcherData["body"];
type FullUpdateBody = { [K in keyof Required<UpdateBody>]: UpdateBody[K] };

/** Build the full replacement body required by PUT /user_matchers/{id}. */
export function currentRuleBody(current: GetUserMatcherResponses[200]): UpdateBody {
  return {
    act: current.act,
    active: current.active,
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
