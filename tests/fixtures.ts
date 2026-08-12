import type { TokenSet } from "../src/config/credentials.ts";
import type {
  InvoiceIndexResponseInvoices,
  InvoiceShowResponseInvoice,
} from "../src/types/freee-invoice/types.gen.ts";
import type { Deal, GetUserMatcherResponses } from "../src/types/freee/types.gen.ts";

export const INVOICE_API_BASE_URL = "https://api.freee.co.jp/iv";

export const MOCK_TOKEN: TokenSet = {
  clientId: "test-client",
  clientSecret: "test-secret",
  accessToken: "test-token",
  refreshToken: "test-refresh",
  expiresAt: Date.now() + 3600000,
};

let nextId = 1;

export function createMockDeal(overrides?: Partial<Deal>): Deal {
  return {
    id: nextId++,
    company_id: 123,
    issue_date: "2026-01-01",
    amount: 10000,
    partner_id: null,
    status: "settled",
    details: [],
    ...overrides,
  };
}

export function createMockUserMatcher(
  overrides?: Partial<GetUserMatcherResponses[200]>,
): GetUserMatcherResponses[200] {
  return {
    id: nextId++,
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

export function createMockInvoiceSummary(
  overrides?: Partial<InvoiceIndexResponseInvoices>,
): InvoiceIndexResponseInvoices {
  const id = overrides?.id ?? nextId++;
  return {
    id,
    company_id: 123,
    invoice_number: `INV-${id}`,
    subject: "テスト請求書",
    billing_date: "2026-08-01",
    memo: "",
    sending_status: "unsent",
    payment_status: "unsettled",
    cancel_status: "uncanceled",
    deal_status: "unregistered",
    total_amount: 110000,
    amount_including_tax: 110000,
    amount_excluding_tax: 100000,
    amount_tax: 10000,
    amount_brought_forward: 0,
    partner_id: 456,
    report_url: `https://invoice.secure.freee.co.jp/reports/invoices/${id}`,
    ...overrides,
  };
}

export function createMockInvoice(
  overrides?: Partial<InvoiceShowResponseInvoice>,
): InvoiceShowResponseInvoice {
  const id = overrides?.id ?? nextId++;
  return {
    ...createMockInvoiceSummary({ id }),
    invoice_note: "",
    created_at: "2026-08-01 10:00:00",
    tax_entry_method: "out",
    tax_fraction: "omit",
    withholding_tax_entry_method: "out",
    partner_title: "御中",
    lines: [
      {
        id: 1,
        type: "item",
        description: "コンサルティング",
        quantity: 1,
        unit_price: "100000",
        tax_rate: 10,
        withholding: false,
      },
    ],
    ...overrides,
  };
}
