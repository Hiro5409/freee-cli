import { define } from "gunshi";

import { fetchAll } from "../../api/paginate.ts";
import { listArgs } from "../../global-args.ts";
import { initCommand, monthToDateRange, parseLimit } from "../../helpers.ts";
import { formatOutput } from "../../output/formatter.ts";
import { getWalletTxns } from "../../types/freee/sdk.gen.ts";

export const walletTransactionListCommand = define({
  name: "wallet-txn-list",
  description: "List wallet transactions for a company",
  args: {
    ...listArgs,
    month: { type: "string" as const, description: "Filter by month (YYYY-MM)" },
  },
  run: async (ctx) => {
    const { companyId, format } = initCommand(ctx);
    const monthFilter = ctx.values.month ? monthToDateRange(ctx.values.month) : undefined;

    const txns = await fetchAll(async (offset, limit) => {
      const { data } = await getWalletTxns({
        query: {
          company_id: companyId,
          offset,
          limit,
          start_date: monthFilter?.start,
          end_date: monthFilter?.end,
        },
      });
      return data.wallet_txns;
    }, parseLimit(ctx.values.limit));

    return formatOutput(txns, format);
  },
});
