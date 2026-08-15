import { define } from "gunshi";
import colors from "yoctocolors";

import { writeArgs } from "../../global-args.ts";
import {
  initCommand,
  parseChoice,
  parseDate,
  parseInteger,
  parsePositiveId,
} from "../../helpers.ts";
import { formatDryRun } from "../../output/formatter.ts";
import { createWalletTxn } from "../../types/freee/sdk.gen.ts";
import type { WalletTxnParams } from "../../types/freee/types.gen.ts";

const ENTRY_SIDES = ["income", "expense"] as const;
const WALLET_TYPES = ["bank_account", "credit_card", "wallet"] as const;

export const walletTransactionCreateCommand = define({
  name: "wallet-txn-create",
  description:
    "Create a wallet transaction and let freee evaluate active auto-registration rules against it",
  args: {
    ...writeArgs,
    date: { type: "string" as const, description: "Transaction date (YYYY-MM-DD)", required: true },
    "entry-side": {
      type: "string" as const,
      description: "income or expense",
      required: true,
    },
    amount: { type: "string" as const, description: "Amount (integer yen)", required: true },
    "walletable-id": { type: "string" as const, description: "Walletable ID", required: true },
    "walletable-type": {
      type: "string" as const,
      description: `Walletable type: ${WALLET_TYPES.join(" | ")}`,
      required: true,
    },
    description: {
      type: "string" as const,
      description: "Wallet transaction description matched by auto-registration rules",
    },
    balance: { type: "string" as const, description: "Balance after the txn (integer yen)" },
  },
  examples: `# 口座明細を作成し、有効な自動登録ルールをfreee側に評価させる
$ freee wallet-txn-create --date 2026-08-01 --entry-side expense --amount 5000 \\
    --walletable-id 55 --walletable-type credit_card --description AMAZON.CO.JP --dry-run --format json

# 送信内容を実行前に確認する
$ freee wallet-txn-create --date 2026-08-01 --entry-side expense --amount 5000 \\
    --walletable-id 55 --walletable-type credit_card --dry-run --format json`,
  run: async (ctx) => {
    const { companyId, format } = initCommand(ctx);

    const body: WalletTxnParams = {
      company_id: companyId,
      date: parseDate(ctx.values.date, "--date"),
      entry_side: parseChoice(ctx.values["entry-side"], ENTRY_SIDES, "--entry-side"),
      amount: parseInteger(ctx.values.amount, "--amount"),
      walletable_id: parsePositiveId(ctx.values["walletable-id"], "--walletable-id"),
      walletable_type: parseChoice(
        ctx.values["walletable-type"],
        WALLET_TYPES,
        "--walletable-type",
      ),
      description: ctx.values.description,
      balance:
        ctx.values.balance !== undefined
          ? parseInteger(ctx.values.balance, "--balance")
          : undefined,
    };

    if (ctx.values["dry-run"]) {
      return formatDryRun(
        format,
        { method: "POST", path: "/api/1/wallet_txns", body },
        `${colors.yellow("Dry run —")} would POST /api/1/wallet_txns: ${JSON.stringify(body, null, 2)}`,
      );
    }

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
