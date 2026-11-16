import { define } from "gunshi";
import { args, integer, merge, required } from "gunshi/combinators";

import { companyArgs } from "../../global-args.ts";
import { initCommand } from "../../helpers.ts";
import { getWalletTxn } from "../../types/freee/sdk.gen.ts";

export const walletTransactionShowCommand = define({
  name: "show",
  description: "Show a wallet transaction",
  args: merge(
    companyArgs,
    args({
      id: required(
        integer({ min: 1, max: Number.MAX_SAFE_INTEGER, description: "Wallet transaction ID" }),
      ),
    }),
  ),
  examples: `$ freee wallet-txn show --id 42`,
  run: async (ctx) => {
    const { companyId } = initCommand(ctx);
    const { data } = await getWalletTxn({
      path: { id: ctx.values.id },
      query: { company_id: companyId },
    });
    return JSON.stringify(data.wallet_txn);
  },
});
