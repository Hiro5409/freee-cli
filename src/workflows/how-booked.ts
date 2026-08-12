import { define } from "gunshi";
import pLimit from "p-limit";
import colors from "yoctocolors";

import { fetchAll } from "../api/paginate.ts";
import { companyArgs } from "../global-args.ts";
import { initCommand } from "../helpers.ts";
import { getAccountItems, getDeals, getWalletTxns } from "../types/freee/sdk.gen.ts";
import {
  aggregateByCounts,
  type MatchResult,
  matchTxnToDeals,
  normalizeText,
} from "./match-txn-to-deals.ts";

export function formatHowBookedResults(
  results: MatchResult[],
  format: string,
  emptyMessage: string,
): string {
  const summary = [...aggregateByCounts(results).entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([accountItem, count]) => ({ accountItem, count }));

  if (format === "json") return JSON.stringify({ matches: results, summary }, null, 2);
  if (results.length === 0) return colors.yellow(emptyMessage);

  return [
    colors.green(`Found ${results.length} matches:`),
    ...results.map(
      (result) => `  ${result.date} | ¥${result.amount.toLocaleString()} | ${result.accountItem}`,
    ),
    colors.bold("--- Summary ---"),
    ...summary.map(({ accountItem, count }) => `  ${accountItem}: ${count}件`),
  ].join("\n");
}

export const howBookedCommand = define({
  name: "how-booked",
  description: "Search past bookings to find which account item was used for a keyword",
  args: {
    ...companyArgs,
    keyword: {
      type: "string" as const,
      description: "Search keyword (e.g. ヨドバシ)",
      required: true,
    },
    year: { type: "string" as const, description: "Year to search (default: current year)" },
  },
  run: async (ctx) => {
    const { companyId, format } = initCommand(ctx);
    const keyword = ctx.values.keyword;
    const year = ctx.values.year ?? String(new Date().getFullYear());
    const startDate = `${year}-01-01`;
    const endDate = `${year}-12-31`;

    const allTxns = await fetchAll(async (offset, pageSize) => {
      const { data } = await getWalletTxns({
        query: {
          company_id: companyId,
          start_date: startDate,
          end_date: endDate,
          offset,
          limit: pageSize,
        },
      });
      return data.wallet_txns;
    });

    const normalizedKeyword = normalizeText(keyword);
    const matchedTxns = allTxns.filter((t) =>
      normalizeText(t.description).includes(normalizedKeyword),
    );

    if (matchedTxns.length === 0) {
      return formatHowBookedResults([], format, "No matching transactions found.");
    }

    const { data: acctData } = await getAccountItems({
      query: { company_id: companyId },
    });
    const acctMap = new Map<number, string>();
    for (const a of acctData.account_items) {
      acctMap.set(a.id, a.name);
    }

    const uniqueDates = [...new Set(matchedTxns.map((t) => String(t.date)))];

    const limit = pLimit(5);
    const dealsEntries = await limit.map(uniqueDates, async (date) => {
      const { data } = await getDeals({
        query: {
          company_id: companyId,
          start_issue_date: date,
          end_issue_date: date,
          limit: 100,
        },
      });
      return [date, data.deals] as const;
    });
    const dealsByDate = new Map(dealsEntries);

    const results: MatchResult[] = [];
    for (const date of uniqueDates) {
      const deals = dealsByDate.get(date) ?? [];
      const txnsOnDate = matchedTxns.filter((t) => String(t.date) === date);
      for (const t of txnsOnDate) {
        const matched = matchTxnToDeals(
          { amount: t.amount, description: t.description, date },
          deals,
          acctMap,
        );
        results.push(...matched);
      }
    }

    if (results.length === 0) {
      return formatHowBookedResults([], format, "Found transactions but no matching deals.");
    }

    return formatHowBookedResults(results, format, "No matching deals found.");
  },
});
