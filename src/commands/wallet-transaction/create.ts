import { define } from "gunshi";
import { args, choice, integer, merge, required, string } from "gunshi/combinators";
import colors from "yoctocolors";

import { isoDateArg } from "../../cli-input.ts";
import { companyArgs } from "../../global-args.ts";
import { initCommand } from "../../helpers.ts";
import { createWalletTxn } from "../../types/freee/sdk.gen.ts";
import type { WalletTxnParams } from "../../types/freee/types.gen.ts";

const ENTRY_SIDES = ["income", "expense"] as const;
const WALLET_TYPES = ["bank_account", "credit_card", "wallet"] as const;

export const walletTransactionCreateCommand = define({
  name: "wallet-txn-create",
  description:
    "Create a wallet transaction and let freee evaluate active auto-registration rules against it",
  args: merge(
    companyArgs,
    args({
      date: required(isoDateArg("--date", "Transaction date (YYYY-MM-DD)")),
      "entry-side": required(choice(ENTRY_SIDES, { description: "income or expense" })),
      amount: required(
        integer({
          min: Number.MIN_SAFE_INTEGER,
          max: Number.MAX_SAFE_INTEGER,
          description: "Amount (integer yen)",
        }),
      ),
      "walletable-id": required(
        integer({ min: 1, max: Number.MAX_SAFE_INTEGER, description: "Walletable ID" }),
      ),
      "walletable-type": required(
        choice(WALLET_TYPES, { description: `Walletable type: ${WALLET_TYPES.join(" | ")}` }),
      ),
      description: string({
        description: "Wallet transaction description matched by auto-registration rules",
      }),
      balance: integer({
        min: Number.MIN_SAFE_INTEGER,
        max: Number.MAX_SAFE_INTEGER,
        description: "Balance after the txn (integer yen)",
      }),
    }),
  ),
  examples: `# 口座明細を作成し、有効な自動登録ルールをfreee側に評価させる
$ freee wallet-txn-create --date 2026-08-01 --entry-side expense --amount 5000 \\
    --walletable-id 55 --walletable-type credit_card --description AMAZON.CO.JP --format json`,
  run: async (ctx) => {
    const { companyId, format } = initCommand(ctx);

    const body: WalletTxnParams = {
      company_id: companyId,
      date: ctx.values.date,
      entry_side: ctx.values["entry-side"],
      amount: ctx.values.amount,
      walletable_id: ctx.values["walletable-id"],
      walletable_type: ctx.values["walletable-type"],
      description: ctx.values.description,
      balance: ctx.values.balance,
    };

    const { data } = await createWalletTxn({ body });
    const txn = data.wallet_txn;

    if (format === "json") return JSON.stringify(txn, null, 2);
    return [
      colors.green(`Wallet transaction created: id=${txn.id}`),
      `  ${txn.date} ${txn.entry_side} ${txn.amount} (${txn.walletable_type}:${txn.walletable_id})`,
      txn.rule_matched
        ? colors.green("  rule matched: yes — an active auto-registration rule registered the deal")
        : colors.yellow("  rule matched: no — no active auto-registration rule registered a deal"),
    ].join("\n");
  },
});
