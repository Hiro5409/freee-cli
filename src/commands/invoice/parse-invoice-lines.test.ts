import { describe, expect, test } from "bun:test";

import { CliError } from "../../errors.ts";
import { parseInvoiceLines } from "./parse-invoice-lines.ts";

describe("parseInvoiceLines", () => {
  test("品目行の JSON を明細に変換する", () => {
    const lines = parseInvoiceLines([
      '{"description":"コンサルティング","quantity":1,"unit_price":"100000","tax_rate":10}',
    ]);

    expect(lines).toEqual([
      {
        type: "item",
        description: "コンサルティング",
        quantity: 1,
        unit_price: "100000",
        tax_rate: 10,
      },
    ]);
  });

  test("複数の --line を順序どおり配列にする", () => {
    const lines = parseInvoiceLines([
      '{"description":"A","quantity":1,"unit_price":"100","tax_rate":10}',
      '{"description":"B","quantity":2,"unit_price":"200","tax_rate":8}',
    ]);

    expect(lines).toHaveLength(2);
    expect(lines[0]?.description).toBe("A");
    expect(lines[1]?.description).toBe("B");
  });

  test("テキスト行は description だけで通る", () => {
    const lines = parseInvoiceLines(['{"type":"text","description":"— 以下余白 —"}']);

    expect(lines).toEqual([{ type: "text", description: "— 以下余白 —" }]);
  });

  test("unit_price に数値を渡しても文字列へ正規化する", () => {
    const lines = parseInvoiceLines([
      '{"description":"A","quantity":1,"unit_price":100000,"tax_rate":10}',
    ]);

    expect(lines[0]?.unit_price).toBe("100000");
  });

  test("JSON として壊れていれば CliError", () => {
    expect(() => parseInvoiceLines(["not json"])).toThrow(CliError);
  });

  test("品目行に tax_rate がなければ CliError", () => {
    expect(() =>
      parseInvoiceLines(['{"description":"A","quantity":1,"unit_price":"100"}']),
    ).toThrow(CliError);
  });

  test("品目行に quantity がなければ CliError", () => {
    expect(() =>
      parseInvoiceLines(['{"description":"A","unit_price":"100","tax_rate":10}']),
    ).toThrow(CliError);
  });

  test("freee が認めない税率は CliError", () => {
    expect(() =>
      parseInvoiceLines(['{"description":"A","quantity":1,"unit_price":"100","tax_rate":5}']),
    ).toThrow(CliError);
  });

  test("軽減税率は tax_rate 8 のときだけ許す", () => {
    expect(() =>
      parseInvoiceLines([
        '{"description":"A","quantity":1,"unit_price":"100","tax_rate":10,"reduced_tax_rate":true}',
      ]),
    ).toThrow(CliError);

    const lines = parseInvoiceLines([
      '{"description":"A","quantity":1,"unit_price":"100","tax_rate":8,"reduced_tax_rate":true}',
    ]);
    expect(lines[0]?.reduced_tax_rate).toBe(true);
  });

  test("未知のキーは CliError（打ち間違いを黙って捨てない）", () => {
    expect(() =>
      parseInvoiceLines(['{"descrption":"typo","quantity":1,"unit_price":"100","tax_rate":10}']),
    ).toThrow(CliError);
  });

  test("明細が空なら CliError", () => {
    expect(() => parseInvoiceLines([])).toThrow(CliError);
  });
});
