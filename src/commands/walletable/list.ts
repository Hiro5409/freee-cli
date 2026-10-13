import { define } from "gunshi";
import { args, merge, choice } from "gunshi/combinators";

import { companyArgs } from "../../global-args.ts";
import { initCommand } from "../../helpers.ts";
import { formatOutput } from "../../output/formatter.ts";
import { getWalletables } from "../../types/freee/sdk.gen.ts";

export const walletableListCommand = define({
  name: "walletable-list",
  description: "List walletables: bank accounts, credit cards, and cash wallets",
  args: merge(
    companyArgs,
    args({
      type: choice(["bank_account", "credit_card", "wallet"] as const, {
        description: "Filter by walletable type",
      }),
    }),
  ),
  run: async (ctx) => {
    const { companyId, format } = initCommand(ctx);
    const { data } = await getWalletables({
      query: {
        company_id: companyId,
        type: ctx.values.type,
      },
    });
    return formatOutput(data.walletables, format);
  },
});
