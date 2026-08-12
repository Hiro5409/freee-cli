export const PARTNER_TITLES = ["御中", "様", "(空白)"] as const;
export const TAX_ENTRY_METHODS = ["out", "in"] as const;
export const FRACTIONS = ["omit", "round_up", "round"] as const;
export const PAYMENT_TYPES = ["transfer", "direct_debit", "card"] as const;

/** Flags shared by invoice-create and invoice-update, which write the same document. */
export const invoiceArgs = {
  "partner-id": { type: "string" as const, description: "Partner ID (or use --partner-code)" },
  "partner-code": { type: "string" as const, description: "Partner code (or use --partner-id)" },
  "partner-title": {
    type: "string" as const,
    description: `Honorific: ${PARTNER_TITLES.join(" | ")}`,
  },
  "billing-date": { type: "string" as const, description: "Billing date (YYYY-MM-DD)" },
  "issue-date": {
    type: "string" as const,
    description: "Accrual date used when drafting the linked deal (YYYY-MM-DD)",
  },
  "payment-date": { type: "string" as const, description: "Payment due date (YYYY-MM-DD)" },
  "payment-type": {
    type: "string" as const,
    description: `Payment method: ${PAYMENT_TYPES.join(" | ")}`,
  },
  subject: { type: "string" as const, description: "Invoice subject" },
  "invoice-number": {
    type: "string" as const,
    description: "Invoice number (required when the company does not auto-number)",
  },
  "template-id": { type: "string" as const, description: "Document template ID" },
  memo: { type: "string" as const, description: "Internal memo" },
  "invoice-note": { type: "string" as const, description: "Note printed on the invoice" },
  "tax-entry-method": {
    type: "string" as const,
    description: "Tax display: out (税別/外税) | in (税込/内税)",
  },
  "tax-fraction": {
    type: "string" as const,
    description: `Tax rounding: ${FRACTIONS.join(" | ")}`,
  },
  "line-amount-fraction": {
    type: "string" as const,
    description: `Line amount rounding: ${FRACTIONS.join(" | ")}`,
  },
  "withholding-tax-entry-method": {
    type: "string" as const,
    description: "Withholding base: out (税別) | in (税込)",
  },
  line: {
    type: "string" as const,
    multiple: true as const,
    description:
      'Invoice line as JSON, repeatable. e.g. \'{"description":"作業費","quantity":1,"unit_price":"100000","tax_rate":10}\'',
  },
};
