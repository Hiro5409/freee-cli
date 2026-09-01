import { define } from "gunshi";
import colors from "yoctocolors";

import { PositiveIntegerTextSchema, parseCliInput } from "../../cli-input.ts";
import { dryRunArgs } from "../../global-args.ts";
import { initCommand } from "../../helpers.ts";
import { formatDryRun } from "../../output/formatter.ts";
import { destroyWalletTxn } from "../../types/freee/sdk.gen.ts";

export const walletTransactionDeleteCommand = define({
  name: "wallet-txn-delete",
  description: "Delete a wallet transaction",
  args: {
    ...dryRunArgs,
    id: { type: "string" as const, description: "Wallet transaction ID", required: true },
  },
  examples: `$ freee wallet-txn-delete --id 42 --dry-run --format json`,
  run: async (ctx) => {
    const { companyId, format } = initCommand(ctx);
    const id = parseCliInput(PositiveIntegerTextSchema, ctx.values.id, { label: "--id" });
    if (ctx.values["dry-run"]) {
      return formatDryRun(
        format,
        {
          method: "DELETE",
          path: `/api/1/wallet_txns/${id}`,
          query: { company_id: companyId },
        },
        `${colors.yellow("Dry run —")} would DELETE /api/1/wallet_txns/${id} (company_id=${companyId})`,
      );
    }
    await destroyWalletTxn({ path: { id }, query: { company_id: companyId } });
    if (format === "json") return JSON.stringify({ id, deleted: true }, null, 2);
    return colors.green(`Wallet transaction deleted: id=${id}`);
  },
});
