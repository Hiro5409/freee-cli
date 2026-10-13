import * as v from "valibot";

import { parseCliInput } from "../../cli-input.ts";
import { CliError, errorHints } from "../../errors.ts";
import type { InvoiceRequestLines } from "../../types/freee-invoice/types.gen.ts";

// freee は単価を文字列で受け取る (整数部13桁・小数部3桁)。数値で書かれても取りこぼさない。
const UnitPriceSchema = v.pipe(v.union([v.string(), v.number()]), v.transform(String));

const LineSchema = v.pipe(
  v.strictObject({
    type: v.optional(v.picklist(["item", "text"])),
    description: v.optional(v.string()),
    sales_date: v.optional(v.string()),
    unit: v.optional(v.string()),
    quantity: v.optional(v.number()),
    unit_price: v.optional(UnitPriceSchema),
    tax_rate: v.optional(v.picklist([0, 8, 10])),
    reduced_tax_rate: v.optional(v.boolean()),
    withholding: v.optional(v.boolean()),
    account_item_id: v.optional(v.number()),
    tax_code: v.optional(v.number()),
    item_id: v.optional(v.number()),
    section_id: v.optional(v.number()),
    tag_ids: v.optional(v.array(v.number())),
    segment_1_tag_id: v.optional(v.number()),
    segment_2_tag_id: v.optional(v.number()),
    segment_3_tag_id: v.optional(v.number()),
  }),
  v.forward(
    v.partialCheck(
      [["type"], ["tax_rate"]],
      (line) => (line.type ?? "item") !== "item" || line.tax_rate !== undefined,
      "Item lines require tax_rate.",
    ),
    ["tax_rate"],
  ),
  v.forward(
    v.partialCheck(
      [["type"], ["quantity"]],
      (line) => (line.type ?? "item") !== "item" || line.quantity !== undefined,
      "Item lines require quantity.",
    ),
    ["quantity"],
  ),
  v.forward(
    v.partialCheck(
      [["reduced_tax_rate"], ["tax_rate"]],
      (line) => !line.reduced_tax_rate || line.tax_rate === 8,
      "reduced_tax_rate is only valid with tax_rate 8.",
    ),
    ["reduced_tax_rate"],
  ),
);
const LineArgumentSchema = v.pipe(
  v.string(),
  v.parseJson(undefined, "Expected valid JSON."),
  LineSchema,
);

export function parseInvoiceLines(values: string[]): InvoiceRequestLines[] {
  if (values.length === 0) {
    throw new CliError("An invoice needs at least one --line.", {
      code: "INVALID_INPUT",
      why: "freee requires a non-empty lines[] on every invoice.",
      hint: errorHints.invalidValue,
    });
  }

  return values.map((value, index) => {
    const label = `--line #${index + 1}`;
    const line = parseCliInput(LineArgumentSchema, value, {
      label,
      why: "The line does not match freee's invoice line schema.",
    });
    return { type: "item", ...line } satisfies InvoiceRequestLines;
  });
}
