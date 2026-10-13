import type { GetUserMatcherResponses } from "../../types/freee/types.gen.ts";

export function createMockUserMatcher(
  overrides: Partial<GetUserMatcherResponses[200]> & Pick<GetUserMatcherResponses[200], "id">,
): GetUserMatcherResponses[200] {
  return {
    entry_side_str: "expense",
    description: "AMAZON",
    condition: 0,
    priority: 5,
    act: 1,
    tax_name: "課対仕入10%",
    tax_code: 21,
    account_item_name: "消耗品費",
    walletable: "楽天カード",
    card_label: "メインカード",
    card_label_id: 7,
    // act=1 (auto_standard) では振替先口座は意味を持たないため null
    transfer_walletable: null,
    min_amount: 100,
    max_amount: 50000,
    deal_description: "Amazon購入",
    partner_name: "Amazon",
    item_name: "書籍",
    section_name: "開発部",
    division_tag_1_name: "セグメントA",
    division_tag_2_name: "セグメントB",
    division_tag_3_name: "セグメントC",
    default_tag_names: ["経費", "自動登録"],
    qualified_invoice_setting: "non_qualified",
    suggest_tax_from_walletable_invoice: false,
    last_updated_user_id: 1,
    user_name: "tester",
    updated_at: "2026-08-01",
    corrected_wallet_txn_count: 3,
    corrected_wallet_txn_count_percentage: 100,
    active: true,
    ...overrides,
  };
}
