import { args, choice, integer, multiple, string } from "gunshi/combinators";

import { isoDateArg } from "../../cli-input.ts";
const PARTNER_TITLES = ["御中", "様", "(空白)"] as const;
const TAX_ENTRY_METHODS = ["out", "in"] as const;
const FRACTIONS = ["omit", "round_up", "round"] as const;
const PAYMENT_TYPES = ["transfer", "direct_debit", "card"] as const;

/** Flags shared by invoice-create and invoice-update, which write the same document. */
export const invoiceArgs = args({
  "partner-id": integer({
    min: 1,
    max: Number.MAX_SAFE_INTEGER,
    description: "Partner ID (or use --partner-code)",
  }),
  "partner-code": string({ description: "Partner code (or use --partner-id)" }),
  "partner-title": choice(PARTNER_TITLES, {
    description: `Honorific: ${PARTNER_TITLES.join(" | ")}`,
  }),
  "billing-date": isoDateArg("--billing-date", "Billing date (YYYY-MM-DD)"),
  "issue-date": isoDateArg(
    "--issue-date",
    "Accrual date used when drafting the linked deal (YYYY-MM-DD)",
  ),
  "payment-date": isoDateArg("--payment-date", "Payment due date (YYYY-MM-DD)"),
  "payment-type": choice(PAYMENT_TYPES, {
    description: `Payment method: ${PAYMENT_TYPES.join(" | ")}`,
  }),
  subject: string({ description: "Invoice subject" }),
  "invoice-number": string({
    description: "Invoice number (required when the company does not auto-number)",
  }),
  "template-id": integer({
    min: 1,
    max: Number.MAX_SAFE_INTEGER,
    description: "Document template ID",
  }),
  memo: string({ description: "Internal memo" }),
  "invoice-note": string({ description: "Note printed on the invoice" }),
  "tax-entry-method": choice(TAX_ENTRY_METHODS, {
    description: "Tax display: out (税別/外税) | in (税込/内税)",
  }),
  "tax-fraction": choice(FRACTIONS, { description: `Tax rounding: ${FRACTIONS.join(" | ")}` }),
  "line-amount-fraction": choice(FRACTIONS, {
    description: `Line amount rounding: ${FRACTIONS.join(" | ")}`,
  }),
  "withholding-tax-entry-method": choice(TAX_ENTRY_METHODS, {
    description: "Withholding base: out (税別) | in (税込)",
  }),
  line: multiple(
    string({
      description:
        'Invoice line as JSON, repeatable. e.g. \'{"description":"作業費","quantity":1,"unit_price":"100000","tax_rate":10}\'',
    }),
  ),
});
