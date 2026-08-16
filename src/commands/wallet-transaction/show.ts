import { define } from "gunshi";

import { companyArgs } from "../../global-args.ts";
import { initCommand, parsePositiveId } from "../../helpers.ts";
import { formatResource } from "../../output/formatter.ts";
import { getWalletTxn } from "../../types/freee/sdk.gen.ts";

export const walletTransactionShowCommand = define({
  name: "wallet-txn-show",
  description: "Show a wallet transaction",
  args: {
    ...companyArgs,
    id: { type: "string" as const, description: "Wallet transaction ID", required: true },
  },
  examples: `$ freee wallet-txn-show --id 42 --format json`,
  run: async (ctx) => {
    const { companyId, format } = initCommand(ctx);
    const { data } = await getWalletTxn({
      path: { id: parsePositiveId(ctx.values.id, "--id") },
      query: { company_id: companyId },
    });
    return formatResource(data.wallet_txn, format);
  },
});
