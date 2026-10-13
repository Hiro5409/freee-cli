import type {
  InvoiceIndexResponseInvoices,
  InvoiceShowResponseInvoice,
} from "../../types/freee-invoice/types.gen.ts";

export const INVOICE_API_BASE_URL = "https://api.freee.co.jp/iv";

export function createMockInvoiceSummary(
  overrides: Partial<InvoiceIndexResponseInvoices> & Pick<InvoiceIndexResponseInvoices, "id">,
): InvoiceIndexResponseInvoices {
  const { id, ...rest } = overrides;
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
    ...rest,
  };
}

export function createMockInvoice(
  overrides: Partial<InvoiceShowResponseInvoice> & Pick<InvoiceShowResponseInvoice, "id">,
): InvoiceShowResponseInvoice {
  const { id, ...rest } = overrides;
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
    ...rest,
  };
}
