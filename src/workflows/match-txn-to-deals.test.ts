import { describe, expect, test } from "bun:test";

import type { Deal } from "../types/freee/types.gen.ts";
import {
  aggregateByCounts,
  type MatchResult,
  matchTxnToDeals,
  normalizeText,
} from "./match-txn-to-deals.ts";

function makeDeal(overrides: Partial<Deal> = {}): Deal {
  return {
    id: 1,
    company_id: 1,
    issue_date: "2026-01-01",
    amount: 0,
    partner_id: null,
    status: "settled",
    ...overrides,
  };
}

describe("normalizeText", () => {
  test("大文字 → 小文字", () => {
    expect(normalizeText("ABC")).toBe("abc");
  });

  test("NFKC 正規化: 全角英数 → 半角英数", () => {
    expect(normalizeText("Ａｂｃ１２３")).toBe("abc123");
  });

  test("空文字 → 空文字", () => {
    expect(normalizeText("")).toBe("");
  });

  test("カタカナはそのまま（NFKC ではカタカナ→半角カナにならない）", () => {
    expect(normalizeText("ヨドバシ")).toBe("ヨドバシ");
  });

  test("半角カナ → 全角カタカナ（NFKC 正規化）", () => {
    expect(normalizeText("ﾖﾄﾞﾊﾞｼ")).toBe("ヨドバシ");
  });
});

describe("matchTxnToDeals", () => {
  const acctMap = new Map([
    [1, "消耗品費"],
    [2, "通信費"],
  ]);

  test("detail.amount 一致 → マッチ", () => {
    const txn = { amount: 5000, description: "ヨドバシ", date: "2026-01-15" };
    const deals = [
      makeDeal({
        details: [
          { id: 1, account_item_id: 1, tax_code: 0, amount: 5000, vat: 0, entry_side: "debit" },
        ],
      }),
    ];
    const result = matchTxnToDeals(txn, deals, acctMap);
    expect(result).toEqual([
      { date: "2026-01-15", amount: 5000, description: "ヨドバシ", accountItem: "消耗品費" },
    ]);
  });

  test("deal.amount 一致 → マッチ", () => {
    const txn = { amount: 3000, description: "AWS", date: "2026-02-01" };
    const deals = [
      makeDeal({
        amount: 3000,
        details: [
          { id: 1, account_item_id: 2, tax_code: 0, amount: 1000, vat: 0, entry_side: "debit" },
        ],
      }),
    ];
    const result = matchTxnToDeals(txn, deals, acctMap);
    expect(result).toEqual([
      { date: "2026-02-01", amount: 3000, description: "AWS", accountItem: "通信費" },
    ]);
  });

  test("金額不一致 → 空配列", () => {
    const txn = { amount: 9999, description: "test", date: "2026-01-01" };
    const deals = [
      makeDeal({
        amount: 5000,
        details: [
          { id: 1, account_item_id: 1, tax_code: 0, amount: 5000, vat: 0, entry_side: "debit" },
        ],
      }),
    ];
    expect(matchTxnToDeals(txn, deals, acctMap)).toEqual([]);
  });

  test("details が未定義 → スキップ（クラッシュしない）", () => {
    const txn = { amount: 1000, description: "test", date: "2026-01-01" };
    const deals = [makeDeal()];
    expect(matchTxnToDeals(txn, deals, acctMap)).toEqual([]);
  });

  test("acctMap にない account_item_id → unknown(id) 表記", () => {
    const txn = { amount: 5000, description: "test", date: "2026-01-01" };
    const deals = [
      makeDeal({
        details: [
          { id: 1, account_item_id: 999, tax_code: 0, amount: 5000, vat: 0, entry_side: "debit" },
        ],
      }),
    ];
    const result = matchTxnToDeals(txn, deals, acctMap);
    expect(result).toHaveLength(1);
    expect(result[0]?.accountItem).toBe("unknown(999)");
  });
});

describe("aggregateByCounts", () => {
  test("同一科目2件 + 別科目1件 → 正しくカウント", () => {
    const results: MatchResult[] = [
      { date: "2026-01-01", amount: 1000, description: "a", accountItem: "消耗品費" },
      { date: "2026-01-02", amount: 2000, description: "b", accountItem: "消耗品費" },
      { date: "2026-01-03", amount: 3000, description: "c", accountItem: "通信費" },
    ];
    const counts = aggregateByCounts(results);
    expect(counts.get("消耗品費")).toBe(2);
    expect(counts.get("通信費")).toBe(1);
    expect(counts.size).toBe(2);
  });

  test("空配列 → 空 Map", () => {
    expect(aggregateByCounts([]).size).toBe(0);
  });
});
