import { define } from "gunshi";
import colors from "yoctocolors";

import { IsoDateSchema, PositiveIntegerTextSchema, parseCliInput } from "../../cli-input.ts";
import { CliError, errorHints } from "../../errors.ts";
import { companyArgs } from "../../global-args.ts";
import { initCommand } from "../../helpers.ts";
import { invoicesCreate } from "../../types/freee-invoice/sdk.gen.ts";
import type { InvoiceRequest } from "../../types/freee-invoice/types.gen.ts";
import { invoiceArgs } from "./invoice-args.ts";
import { parseInvoiceLines } from "./parse-invoice-lines.ts";

function resolvePartner(values: {
  "partner-id"?: string;
  "partner-code"?: string;
}): Pick<InvoiceRequest, "partner_id" | "partner_code"> {
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

  throw new CliError("An invoice needs a partner: pass --partner-id or --partner-code.", {
    code: "INVALID_INPUT",
    why: "freee requires the billed partner on every invoice.",
    hint: errorHints.positiveId,
  });
}

export const invoiceCreateCommand = define({
  name: "invoice-create",
  description: "Create an invoice via the freee invoice API",
  args: { ...companyArgs, ...invoiceArgs },
  examples: `# 外税・10%の1明細で作成
$ freee invoice-create --partner-id 456 --billing-date 2026-08-01 \\
    --line '{"description":"コンサルティング","quantity":1,"unit_price":"100000","tax_rate":10}' --format json

# 自動採番が無効な事業所
$ freee invoice-create --partner-id 456 --billing-date 2026-08-01 --invoice-number INV-2026-001 \\
    --line '{"description":"作業費","quantity":1,"unit_price":"50000","tax_rate":10}' --format json`,
  run: async (ctx) => {
    const { companyId, format } = initCommand(ctx);

    const body: InvoiceRequest = {
      company_id: companyId,
      billing_date: parseCliInput(IsoDateSchema, ctx.values["billing-date"], {
        label: "--billing-date",
      }),
      ...resolvePartner(ctx.values),
      partner_title: ctx.values["partner-title"] ?? "御中",
      tax_entry_method: ctx.values["tax-entry-method"] ?? "out",
      tax_fraction: ctx.values["tax-fraction"] ?? "omit",
      withholding_tax_entry_method: ctx.values["withholding-tax-entry-method"] ?? "out",
      line_amount_fraction: ctx.values["line-amount-fraction"],
      issue_date: ctx.values["issue-date"]
        ? parseCliInput(IsoDateSchema, ctx.values["issue-date"], { label: "--issue-date" })
        : undefined,
      payment_date: ctx.values["payment-date"]
        ? parseCliInput(IsoDateSchema, ctx.values["payment-date"], { label: "--payment-date" })
        : undefined,
      payment_type: ctx.values["payment-type"],
      template_id: ctx.values["template-id"]
        ? parseCliInput(PositiveIntegerTextSchema, ctx.values["template-id"], {
            label: "--template-id",
          })
        : undefined,
      subject: ctx.values.subject,
      invoice_number: ctx.values["invoice-number"],
      memo: ctx.values.memo,
      invoice_note: ctx.values["invoice-note"],
      lines: parseInvoiceLines(ctx.values.line ?? []),
    };

    const { data } = await invoicesCreate({ body });

    if (format === "json") return JSON.stringify(data.invoice, null, 2);
    return [
      colors.green(`Invoice created: id=${data.invoice.id}`),
      `  number: ${data.invoice.invoice_number}`,
      `  sending: ${data.invoice.sending_status} / deal: ${data.invoice.deal_status}`,
      `  ${data.invoice.report_url}`,
    ].join("\n");
  },
});
