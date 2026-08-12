import { define } from "gunshi";
import colors from "yoctocolors";

import { CliError, errorHints } from "../../errors.ts";
import { writeArgs } from "../../global-args.ts";
import { initCommand, parseChoice, parseDate, parsePositiveId } from "../../helpers.ts";
import { formatDryRun } from "../../output/formatter.ts";
import { invoicesShow, invoicesUpdate } from "../../types/freee-invoice/sdk.gen.ts";
import type {
  InvoiceRequest,
  InvoiceShowResponseInvoice,
} from "../../types/freee-invoice/types.gen.ts";
import { invoiceApiError } from "./invoice-api-error.ts";
import {
  FRACTIONS,
  invoiceArgs,
  PARTNER_TITLES,
  PAYMENT_TYPES,
  TAX_ENTRY_METHODS,
} from "./invoice-args.ts";
import { parseInvoiceLines } from "./parse-invoice-lines.ts";

/** freee replaces the whole invoice on PUT, so anything not resent is lost. */
function required<T>(value: T | undefined, field: string, flag: string): T {
  if (value === undefined) {
    throw new CliError(`freee did not return ${field} for this invoice; pass ${flag} explicitly.`, {
      why: "PUT /invoices/{id} replaces the whole document, and freee requires this field. Guessing it would silently change the invoice.",
      hint: errorHints.invalidValue,
    });
  }
  return value;
}

function nullToUndefined<T>(value: T | null | undefined): T | undefined {
  return value ?? undefined;
}

/**
 * Rebuild a full write payload from the invoice freee currently holds.
 *
 * Fields freee does not return (`partner_contact_email_to`, `partner_contact_email_cc`,
 * `partner_sending_method`) cannot round-trip; freee refills them from the partner
 * master when they are absent.
 */
function invoiceRequestFromCurrent(
  current: InvoiceShowResponseInvoice,
  companyId: number,
  overrides: Partial<InvoiceRequest>,
): InvoiceRequest {
  const broughtForward = current.amount_brought_forward ?? 0;

  return {
    company_id: companyId,
    // Send the ID only: freee rejects a payload carrying both ID and code.
    partner_id: current.partner_id,
    partner_title: required(
      overrides.partner_title ?? current.partner_title,
      "partner_title",
      "--partner-title",
    ),
    tax_entry_method: required(
      overrides.tax_entry_method ?? current.tax_entry_method,
      "tax_entry_method",
      "--tax-entry-method",
    ),
    tax_fraction: required(
      overrides.tax_fraction ?? current.tax_fraction,
      "tax_fraction",
      "--tax-fraction",
    ),
    withholding_tax_entry_method: required(
      overrides.withholding_tax_entry_method ?? current.withholding_tax_entry_method,
      "withholding_tax_entry_method",
      "--withholding-tax-entry-method",
    ),
    billing_date: overrides.billing_date ?? current.billing_date,
    invoice_number: current.invoice_number,
    branch_no: nullToUndefined(current.branch_no),
    template_id: overrides.template_id ?? current.template_id,
    issue_date: overrides.issue_date ?? nullToUndefined(current.issue_date),
    payment_date: overrides.payment_date ?? nullToUndefined(current.payment_date),
    payment_type: overrides.payment_type ?? current.payment_type,
    line_amount_fraction: overrides.line_amount_fraction ?? current.line_amount_fraction,
    subject: overrides.subject ?? current.subject,
    memo: overrides.memo ?? current.memo,
    invoice_note: overrides.invoice_note ?? current.invoice_note,
    // freee only accepts amount_brought_forward alongside the include flag.
    ...(broughtForward !== 0
      ? { include_amount_brought_forward: true, amount_brought_forward: broughtForward }
      : {}),
    partner_address_zipcode: current.partner_address_zipcode,
    partner_address_prefecture_code: current.partner_address_prefecture_code,
    partner_address_street_name1: current.partner_address_street_name1,
    partner_address_street_name2: current.partner_address_street_name2,
    partner_contact_department: current.partner_contact_department,
    partner_contact_name: current.partner_contact_name,
    partner_display_name: current.partner_display_name,
    partner_bank_account: current.partner_bank_account,
    company_contact_name: current.company_contact_name,
    company_name: current.company_name,
    company_description: current.company_description,
    bank_account_to_transfer: current.bank_account_to_transfer,
    lines:
      overrides.lines ??
      current.lines.map((line) => ({
        type: line.type,
        description: line.description,
        sales_date: nullToUndefined(line.sales_date),
        unit: line.unit,
        quantity: nullToUndefined(line.quantity),
        unit_price: nullToUndefined(line.unit_price),
        tax_rate: line.tax_rate,
        reduced_tax_rate: line.reduced_tax_rate,
        withholding: line.withholding,
      })),
  };
}

export const invoiceUpdateCommand = define({
  name: "invoice-update",
  description:
    "Update an invoice via the freee invoice API (fetch-merge-PUT; unspecified fields are resent unchanged)",
  args: {
    ...writeArgs,
    ...invoiceArgs,
    id: { type: "string" as const, description: "Invoice ID", required: true },
  },
  examples: `$ freee invoice-update --id 456 --subject "August invoice" --dry-run --format json`,
  run: async (ctx) => {
    const { companyId, format } = initCommand(ctx);
    const id = parsePositiveId(ctx.values.id, "--id");

    const lines = ctx.values.line?.length ? parseInvoiceLines(ctx.values.line) : undefined;

    const overrides: Partial<InvoiceRequest> = {
      subject: ctx.values.subject,
      memo: ctx.values.memo,
      invoice_note: ctx.values["invoice-note"],
      billing_date: ctx.values["billing-date"]
        ? parseDate(ctx.values["billing-date"], "--billing-date")
        : undefined,
      issue_date: ctx.values["issue-date"]
        ? parseDate(ctx.values["issue-date"], "--issue-date")
        : undefined,
      payment_date: ctx.values["payment-date"]
        ? parseDate(ctx.values["payment-date"], "--payment-date")
        : undefined,
      payment_type: ctx.values["payment-type"]
        ? parseChoice(ctx.values["payment-type"], PAYMENT_TYPES, "--payment-type")
        : undefined,
      partner_title: ctx.values["partner-title"]
        ? parseChoice(ctx.values["partner-title"], PARTNER_TITLES, "--partner-title")
        : undefined,
      tax_entry_method: ctx.values["tax-entry-method"]
        ? parseChoice(ctx.values["tax-entry-method"], TAX_ENTRY_METHODS, "--tax-entry-method")
        : undefined,
      tax_fraction: ctx.values["tax-fraction"]
        ? parseChoice(ctx.values["tax-fraction"], FRACTIONS, "--tax-fraction")
        : undefined,
      line_amount_fraction: ctx.values["line-amount-fraction"]
        ? parseChoice(ctx.values["line-amount-fraction"], FRACTIONS, "--line-amount-fraction")
        : undefined,
      withholding_tax_entry_method: ctx.values["withholding-tax-entry-method"]
        ? parseChoice(
            ctx.values["withholding-tax-entry-method"],
            TAX_ENTRY_METHODS,
            "--withholding-tax-entry-method",
          )
        : undefined,
      template_id: ctx.values["template-id"]
        ? parsePositiveId(ctx.values["template-id"], "--template-id")
        : undefined,
      lines,
    };

    try {
      const { data } = await invoicesShow({ path: { id }, query: { company_id: companyId } });
      const body = invoiceRequestFromCurrent(data.invoice, companyId, overrides);

      if (ctx.values["dry-run"]) {
        return formatDryRun(
          format,
          { method: "PUT", path: `/invoices/${id}`, body },
          `${colors.yellow("Dry run —")} would PUT /invoices/${id}: ${JSON.stringify(body, null, 2)}`,
        );
      }

      const { data: updated } = await invoicesUpdate({ path: { id }, body });

      if (format === "json") return JSON.stringify(updated.invoice, null, 2);
      return [
        colors.green(`Invoice updated: id=${updated.invoice.id}`),
        `  number: ${updated.invoice.invoice_number}`,
        `  ${updated.invoice.report_url}`,
      ].join("\n");
    } catch (e) {
      throw invoiceApiError(e);
    }
  },
});
