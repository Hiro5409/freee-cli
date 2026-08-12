import { define } from "gunshi";

import { CliError } from "../../errors.ts";
import { companyArgs } from "../../global-args.ts";
import { initCommand } from "../../helpers.ts";
import { formatOutput } from "../../output/formatter.ts";
import { getWalletables } from "../../types/freee/sdk.gen.ts";

function parseWalletType(value: unknown): "bank_account" | "credit_card" | "wallet" {
  if (value === "bank_account" || value === "credit_card" || value === "wallet") return value;
  throw new CliError(`--type must be "bank_account", "credit_card", or "wallet", got "${value}"`);
}

export const walletListCommand = define({
  name: "wallet-list",
  description: "List connected walletables (bank accounts, credit cards)",
  args: {
    ...companyArgs,
    type: {
      type: "string" as const,
      description: "Filter by type: bank_account, credit_card, wallet",
    },
  },
  run: async (ctx) => {
    const { companyId, format } = initCommand(ctx);
    const { data } = await getWalletables({
      query: {
        company_id: companyId,
        type: ctx.values.type ? parseWalletType(ctx.values.type) : undefined,
      },
    });
    return formatOutput(data.walletables, format);
  },
});
