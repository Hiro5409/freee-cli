import * as z from "zod/mini";

import { CliError, errorHints } from "../../errors.ts";
import type { InvoiceRequestLines } from "../../types/freee-invoice/types.gen.ts";

// freee は単価を文字列で受け取る (整数部13桁・小数部3桁)。数値で書かれても取りこぼさない。
const UnitPrice = z.codec(z.union([z.string(), z.number()]), z.string(), {
  decode: (value) => String(value),
  encode: (value) => value,
});

const LineSchema = z
  .strictObject({
    type: z.optional(z.enum(["item", "text"])),
    description: z.optional(z.string()),
    sales_date: z.optional(z.string()),
    unit: z.optional(z.string()),
    quantity: z.optional(z.number()),
    unit_price: z.optional(UnitPrice),
    tax_rate: z.optional(z.union([z.literal(0), z.literal(8), z.literal(10)])),
    reduced_tax_rate: z.optional(z.boolean()),
    withholding: z.optional(z.boolean()),
    account_item_id: z.optional(z.number()),
    tax_code: z.optional(z.number()),
    item_id: z.optional(z.number()),
    section_id: z.optional(z.number()),
    tag_ids: z.optional(z.array(z.number())),
    segment_1_tag_id: z.optional(z.number()),
    segment_2_tag_id: z.optional(z.number()),
    segment_3_tag_id: z.optional(z.number()),
  })
  .check(
    z.refine((line) => (line.type ?? "item") !== "item" || line.tax_rate !== undefined, {
      message: "item lines require tax_rate",
    }),
    z.refine((line) => (line.type ?? "item") !== "item" || line.quantity !== undefined, {
      message: "item lines require quantity",
    }),
    z.refine((line) => !line.reduced_tax_rate || line.tax_rate === 8, {
      message: "reduced_tax_rate is only valid with tax_rate 8",
    }),
  );

/**
 * Turn repeated `--line '<json>'` values into freee invoice line items.
 *
 * Each value mirrors the freee `lines[]` object one-to-one, so there is no
 * bespoke syntax to learn and nothing to translate wrongly.
 */
export function parseInvoiceLines(values: string[]): InvoiceRequestLines[] {
  if (values.length === 0) {
    throw new CliError("An invoice needs at least one --line.", {
      why: "freee requires a non-empty lines[] on every invoice.",
      hint: errorHints.invalidValue,
    });
  }

  return values.map((value, index) => {
    const label = `--line #${index + 1}`;

    let json: unknown;
    try {
      json = JSON.parse(value);
    } catch {
      throw new CliError(`${label} is not valid JSON: ${value}`, {
        why: "Each --line takes one JSON object matching freee's invoice line fields.",
        hint: errorHints.invalidValue,
      });
    }

    const result = LineSchema.safeParse(json);
    if (!result.success) {
      throw new CliError(`${label} is invalid: ${z.prettifyError(result.error)}`, {
        why: "The line does not match freee's invoice line schema.",
        hint: errorHints.invalidValue,
      });
    }

    return { type: "item", ...result.data } satisfies InvoiceRequestLines;
  });
}
