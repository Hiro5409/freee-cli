import type { Deal } from "../types/freee/types.gen.ts";

export type MatchResult = {
  date: string;
  amount: number;
  description: string;
  accountItem: string;
};

export function normalizeText(s: string): string {
  return s.normalize("NFKC").toLowerCase();
}

export function matchTxnToDeals(
  txn: { amount: number; description: string; date: string },
  deals: Deal[],
  acctMap: Map<number, string>,
): MatchResult[] {
  const results: MatchResult[] = [];
  for (const deal of deals) {
    for (const detail of deal.details ?? []) {
      if (detail.amount === txn.amount || deal.amount === txn.amount) {
        results.push({
          date: txn.date,
          amount: txn.amount,
          description: txn.description,
          accountItem: acctMap.get(detail.account_item_id) ?? `unknown(${detail.account_item_id})`,
        });
      }
    }
  }
  return results;
}

export function aggregateByCounts(results: MatchResult[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const r of results) {
    counts.set(r.accountItem, (counts.get(r.accountItem) ?? 0) + 1);
  }
  return counts;
}
