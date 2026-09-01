import { define } from "gunshi";
import colors from "yoctocolors";

import { IsoDateSchema, PositiveIntegerTextSchema, parseCliInput } from "../../cli-input.ts";
import { CliError, errorHints } from "../../errors.ts";
import { dryRunArgs } from "../../global-args.ts";
import { initCommand } from "../../helpers.ts";
import { formatDryRun } from "../../output/formatter.ts";
import { invoicesShow, invoicesUpdate } from "../../types/freee-invoice/sdk.gen.ts";
import type {
  InvoiceRequest,
  InvoiceShowResponseInvoice,
} from "../../types/freee-invoice/types.gen.ts";
import { invoiceArgs } from "./invoice-args.ts";
import { parseInvoiceLines } from "./parse-invoice-lines.ts";

function required<T>(value: T | undefined, field: string, flag: string): T {
  if (value === undefined) {
    throw new CliError(`freee did not return ${field} for this invoice; pass ${flag} explicitly.`, {
      code: "INVALID_INPUT",
      why: "PUT /invoices/{id} replaces the whole document, and freee requires this field. Guessing it would silently change the invoice.",
      hint: errorHints.invalidValue,
    });
  }
  return value;
}

function nullToUndefined<T>(value: T | null | undefined): T | undefined {
  return value ?? undefined;
}

type PartnerOverride =
  | { partner_id: number; partner_code?: never }
  | { partner_code: string; partner_id?: never };

function resolvePartnerOverride(values: {
  "partner-id"?: string;
  "partner-code"?: string;
}): PartnerOverride | undefined {
  const id = values["partner-id"];
  const code = values["partner-code"];

  if (id && code) {
    throw new CliError("Pass exactly one of --partner-id or --partner-code, not both.", {
      code: "INVALID_INPUT",
      why: "freee resolves the partner from either the ID or the code, never both.",
      hint: errorHints.oneIdentifier,
    });
  }
  if (id)
    return { partner_id: parseCliInput(PositiveIntegerTextSchema, id, { label: "--partner-id" }) };
  if (code) return { partner_code: code };
  return undefined;
}

// PUT replaces the whole invoice. Fields absent from the response are refilled from the partner master.
function invoiceRequestFromCurrent(
  current: InvoiceShowResponseInvoice,
  companyId: number,
  overrides: Partial<InvoiceRequest>,
  partnerOverride?: PartnerOverride,
): InvoiceRequest {
  const broughtForward = current.amount_brought_forward ?? 0;

  return {
    company_id: companyId,
    ...(partnerOverride ?? { partner_id: current.partner_id }),
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
    invoice_number: overrides.invoice_number ?? current.invoice_number,
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
    ...dryRunArgs,
    ...invoiceArgs,
    id: { type: "string" as const, description: "Invoice ID", required: true },
  },
  examples: `$ freee invoice-update --id 456 --subject "August invoice" --dry-run --format json`,
  run: async (ctx) => {
    const { companyId, format } = initCommand(ctx);
    const id = parseCliInput(PositiveIntegerTextSchema, ctx.values.id, { label: "--id" });
    const partnerOverride = resolvePartnerOverride(ctx.values);

    const lines = ctx.values.line?.length ? parseInvoiceLines(ctx.values.line) : undefined;

    const overrides: Partial<InvoiceRequest> = {
      subject: ctx.values.subject,
      invoice_number: ctx.values["invoice-number"],
      memo: ctx.values.memo,
      invoice_note: ctx.values["invoice-note"],
      billing_date: ctx.values["billing-date"]
        ? parseCliInput(IsoDateSchema, ctx.values["billing-date"], { label: "--billing-date" })
        : undefined,
      issue_date: ctx.values["issue-date"]
        ? parseCliInput(IsoDateSchema, ctx.values["issue-date"], { label: "--issue-date" })
        : undefined,
      payment_date: ctx.values["payment-date"]
        ? parseCliInput(IsoDateSchema, ctx.values["payment-date"], { label: "--payment-date" })
        : undefined,
      payment_type: ctx.values["payment-type"],
      partner_title: ctx.values["partner-title"],
      tax_entry_method: ctx.values["tax-entry-method"],
      tax_fraction: ctx.values["tax-fraction"],
      line_amount_fraction: ctx.values["line-amount-fraction"],
      withholding_tax_entry_method: ctx.values["withholding-tax-entry-method"],
      template_id: ctx.values["template-id"]
        ? parseCliInput(PositiveIntegerTextSchema, ctx.values["template-id"], {
            label: "--template-id",
          })
        : undefined,
      lines,
    };

    const { data } = await invoicesShow({ path: { id }, query: { company_id: companyId } });
    const body = invoiceRequestFromCurrent(data.invoice, companyId, overrides, partnerOverride);

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
  },
});
