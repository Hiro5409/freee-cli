import { define } from "gunshi";

import { fetchAll } from "../../api/paginate.ts";
import { companyArgs } from "../../global-args.ts";
import { initCommand, monthToDateRange } from "../../helpers.ts";
import { formatOutput } from "../../output/formatter.ts";
import { getWalletTxns } from "../../types/freee/sdk.gen.ts";

export const walletTxnListCommand = define({
  name: "wallet-txn-list",
  description: "List wallet transactions",
  args: {
    ...companyArgs,
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
    });

    return formatOutput(txns, format);
  },
});
