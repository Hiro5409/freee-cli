import { define } from "gunshi";
import { args, integer, merge, required } from "gunshi/combinators";

import { companyArgs } from "../../global-args.ts";
import { initCommand } from "../../helpers.ts";
import { formatResource } from "../../output/formatter.ts";
import { getWalletTxn } from "../../types/freee/sdk.gen.ts";

export const walletTransactionShowCommand = define({
  name: "wallet-txn-show",
  description: "Show a wallet transaction",
  args: merge(
    companyArgs,
    args({
      id: required(
        integer({ min: 1, max: Number.MAX_SAFE_INTEGER, description: "Wallet transaction ID" }),
      ),
    }),
  ),
  examples: `$ freee wallet-txn-show --id 42 --format json`,
  run: async (ctx) => {
    const { companyId, format } = initCommand(ctx);
    const { data } = await getWalletTxn({
      path: { id: ctx.values.id },
      query: { company_id: companyId },
    });
    return formatResource(data.wallet_txn, format);
  },
});
