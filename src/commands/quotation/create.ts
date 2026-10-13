import { define } from "gunshi";
import { args, choice, integer, merge, multiple, required, string } from "gunshi/combinators";
import * as v from "valibot";

import { isoDateArg, parseCliInput } from "../../cli-input.ts";
import { CliError, errorHints } from "../../errors.ts";
import { companyArgs } from "../../global-args.ts";
import { initCommand } from "../../helpers.ts";
import { formatResource } from "../../output/formatter.ts";
import { quotationsCreate } from "../../types/freee-invoice/sdk.gen.ts";
import type { QuotationRequest } from "../../types/freee-invoice/types.gen.ts";

const LineSchema = v.pipe(
  v.string(),
  v.parseJson(undefined, "Expected valid JSON."),
  v.union([
    v.strictObject({ type: v.literal("text"), description: v.optional(v.string()) }),
    v.pipe(
      v.strictObject({
        type: v.optional(v.literal("item"), "item"),
        description: v.optional(v.string()),
        unit: v.optional(v.string()),
        quantity: v.pipe(
          v.number(),
          v.minValue(-99999999.999),
          v.maxValue(99999999.999),
          v.check(
            (value) => /^-?\d+(\.\d{1,3})?$/.test(String(value)),
            "Quantity supports at most three decimal places.",
          ),
        ),
        unit_price: v.optional(
          v.pipe(
            v.union([v.string(), v.number()]),
            v.transform(String),
            v.regex(
              /^-?(?:\d{1,13}(\.\d{1,3})?|\.\d{1,3})$/,
              "Unit price supports at most 13 integer digits and three decimal places.",
            ),
          ),
        ),
        tax_rate: v.picklist([0, 8, 10]),
        reduced_tax_rate: v.optional(v.boolean()),
        withholding: v.optional(v.boolean()),
      }),
      v.forward(
        v.partialCheck(
          [["reduced_tax_rate"], ["tax_rate"]],
          (line) => !line.reduced_tax_rate || line.tax_rate === 8,
          "reduced_tax_rate is only valid with tax_rate 8.",
        ),
        ["reduced_tax_rate"],
      ),
    ),
  ]),
);

export const quotationCreateCommand = define({
  name: "quotation-create",
  description: "Create a quotation via the freee invoice API",
  args: merge(
    companyArgs,
    args({
      "partner-id": integer({
        min: 1,
        max: Number.MAX_SAFE_INTEGER,
        description: "Partner ID (or use --partner-code)",
      }),
      "partner-code": string({ description: "Partner code (or use --partner-id)" }),
      "partner-title": choice(["御中", "様", "(空白)"], {
        description: "Honorific: 御中 | 様 | (空白)",
      }),
      "quotation-date": required(isoDateArg("--quotation-date", "Quotation date (YYYY-MM-DD)")),
      "expiration-date": isoDateArg("--expiration-date", "Expiration date (YYYY-MM-DD)"),
      "delivery-deadline": string({ description: "Delivery deadline" }),
      "delivery-location": string({ description: "Delivery location" }),
      "quotation-number": string({
        description: "Quotation number (required when the company does not auto-number)",
      }),
      subject: string({ description: "Quotation subject" }),
      "template-id": integer({
        min: 1,
        max: Number.MAX_SAFE_INTEGER,
        description: "Quotation template ID",
      }),
      memo: string({ description: "Internal memo" }),
      "quotation-note": string({ description: "Note printed on the quotation" }),
      "tax-entry-method": choice(["out", "in"], {
        description: "Tax display: out (税別/外税) | in (税込/内税)",
      }),
      "tax-fraction": choice(["omit", "round_up", "round"], {
        description: "Tax rounding: omit | round_up | round",
      }),
      "line-amount-fraction": choice(["omit", "round_up", "round"], {
        description: "Line amount rounding: omit | round_up | round",
      }),
      "withholding-tax-entry-method": choice(["out", "in"], {
        description: "Withholding base: out (税別) | in (税込)",
      }),
      line: required(
        multiple(
          string({
            description:
              'Quotation line as JSON, repeatable. e.g. \'{"description":"作業費","quantity":1,"unit_price":"100000","tax_rate":10}\'',
          }),
        ),
      ),
    }),
  ),
  examples: `$ freee quotation-create --partner-id 456 --quotation-date 2026-10-01 --expiration-date 2026-10-31 \\
    --line '{"description":"開発費","quantity":1,"unit_price":"100000","tax_rate":10}' --format json`,
  run: async (ctx) => {
    const { companyId, format } = initCommand(ctx);
    const partnerId = ctx.values["partner-id"];
    const partnerCode = ctx.values["partner-code"];
    if ((partnerId === undefined) === (partnerCode === undefined) || partnerCode?.trim() === "") {
      throw new CliError("Pass exactly one of --partner-id or --partner-code.", {
        code: "INVALID_INPUT",
        why: "freee requires one partner identifier on every quotation.",
        hint: errorHints.oneIdentifier,
      });
    }

    const body: QuotationRequest = {
      company_id: companyId,
      ...(partnerId === undefined ? { partner_code: partnerCode } : { partner_id: partnerId }),
      partner_title: ctx.values["partner-title"] ?? "御中",
      quotation_date: ctx.values["quotation-date"],
      expiration_date: ctx.values["expiration-date"],
      delivery_deadline: ctx.values["delivery-deadline"],
      delivery_location: ctx.values["delivery-location"],
      quotation_number: ctx.values["quotation-number"],
      subject: ctx.values.subject,
      template_id: ctx.values["template-id"],
      memo: ctx.values.memo,
      quotation_note: ctx.values["quotation-note"],
      tax_entry_method: ctx.values["tax-entry-method"] ?? "out",
      tax_fraction: ctx.values["tax-fraction"] ?? "omit",
      line_amount_fraction: ctx.values["line-amount-fraction"],
      withholding_tax_entry_method: ctx.values["withholding-tax-entry-method"] ?? "out",
      lines: ctx.values.line.map((value, index) =>
        parseCliInput(LineSchema, value, {
          label: `--line #${index + 1}`,
          why: "The line does not match freee's quotation line schema.",
        }),
      ),
    };
    const { data } = await quotationsCreate({ body });
    return formatResource(data.quotation, format);
  },
});
