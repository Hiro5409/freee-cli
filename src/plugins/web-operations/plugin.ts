import { define } from "gunshi";
import { plugin } from "gunshi/plugin";
import colors from "yoctocolors";

import { globalArgs } from "../../global-args.ts";
import { formatOutput, formatValue } from "../../output/formatter.ts";
import { runInvoiceRegisterDealCommand } from "./invoice-register-deal-command.ts";
import { runWalletTransactionApplyRulesCommand } from "./wallet-transaction-apply-rules-command.ts";
import {
  runWalletTransactionIgnoreCommand,
  runWalletTransactionRestoreCommand,
} from "./wallet-transaction-command.ts";
import { runWalletTransactionRegisterCommand } from "./wallet-transaction-register-command.ts";
import { runWalletTransactionSettleCommand } from "./wallet-transaction-settle-command.ts";
import { runWalletTransactionTransferCommand } from "./wallet-transaction-transfer-command.ts";
import { runWalletableSyncCommand } from "./walletable-sync-command.ts";

const invoiceRegisterDealCommand = define({
  name: "register-deal",
  description: "Register a Deal from one unregistered invoice through freee Web",
  args: {
    ...globalArgs,
    "dry-run": {
      type: "boolean" as const,
      default: false,
      description: "Verify and show the target without registering a Deal",
    },
    id: {
      type: "string" as const,
      description:
        "Invoice ID from freee invoice-list --deal-status unregistered --cancel-status uncanceled",
      required: true,
    },
  },
  examples: `$ freee web invoice register-deal --id 42 --dry-run --format json`,
  run: async (context) => {
    const result = await runInvoiceRegisterDealCommand(context.values);
    return formatValue(
      result,
      context.values.format,
      "dryRun" in result
        ? `${colors.yellow("Dry run —")} would register a Deal for invoice ${result.target.id}`
        : colors.green(
            `Invoice Deal registered: invoice=${result.target.id} deal=${result.dealId}`,
          ),
    );
  },
});

const walletTransactionIgnoreCommand = define({
  name: "ignore",
  description: "Ignore one unprocessed wallet transaction through freee Web",
  args: {
    ...globalArgs,
    "dry-run": {
      type: "boolean" as const,
      default: false,
      description: "Verify and show the target without ignoring it",
    },
    id: {
      type: "string" as const,
      description: "Wallet transaction ID from freee wallet-txn-list",
      required: true,
    },
  },
  examples: `$ freee web wallet-txn ignore --id 42 --dry-run --format json`,
  run: async (context) => {
    const result = await runWalletTransactionIgnoreCommand(context.values);
    return formatValue(
      result,
      context.values.format,
      "dryRun" in result
        ? `${colors.yellow("Dry run —")} would ignore wallet transaction ${result.target.id}`
        : colors.green(`Wallet transaction ignored: id=${result.target.id}`),
    );
  },
});

const walletTransactionApplyRulesCommand = define({
  name: "apply-rules",
  description: "Show freee's current match count or apply its auto-registration rules",
  args: {
    ...globalArgs,
    "dry-run": {
      type: "boolean" as const,
      default: false,
      description: "Show freee's current match count without applying rules",
    },
  },
  examples: `$ freee web wallet-txn apply-rules --dry-run --format json`,
  run: async (context) => {
    const result = await runWalletTransactionApplyRulesCommand(context.values);
    return formatValue(
      result,
      context.values.format,
      "dryRun" in result
        ? `${colors.yellow("Dry run —")} ${result.matchCount} wallet transactions currently match`
        : colors.green(
            `Auto-registration rules applied: ${result.appliedCount} wallet transactions`,
          ),
    );
  },
});

const walletableSyncCommand = define({
  name: "sync",
  description: "Synchronize one walletable or start and wait for freee Web's bulk synchronization",
  args: {
    ...globalArgs,
    "dry-run": {
      type: "boolean" as const,
      default: false,
      description: "Show the requested synchronization without starting it",
    },
    all: {
      type: "boolean" as const,
      default: false,
      description: "Start bulk sync and report walletables that freee actually syncs",
    },
    id: {
      type: "string" as const,
      description: "Walletable ID from freee walletable-list",
    },
  },
  examples: `$ freee web walletable sync --id 42 --dry-run --format json`,
  run: async (context) => {
    const result = await runWalletableSyncCommand(context.values);
    if (context.values.format === "json") return JSON.stringify(result, null, 2);
    if (!("walletables" in result)) {
      return `${colors.yellow("Dry run —")} would request freee Web bulk synchronization`;
    }
    return formatOutput(
      result.walletables.map((walletable) => ({ ...walletable })),
      "table",
    );
  },
});

const walletTransactionRestoreCommand = define({
  name: "restore",
  description: "Restore one ignored wallet transaction to unprocessed through freee Web",
  args: {
    ...globalArgs,
    "dry-run": {
      type: "boolean" as const,
      default: false,
      description: "Verify and show the target without restoring it",
    },
    id: {
      type: "string" as const,
      description: "Wallet transaction ID from freee wallet-txn-list",
      required: true,
    },
  },
  examples: `$ freee web wallet-txn restore --id 42 --dry-run --format json`,
  run: async (context) => {
    const result = await runWalletTransactionRestoreCommand(context.values);
    return formatValue(
      result,
      context.values.format,
      "dryRun" in result
        ? `${colors.yellow("Dry run —")} would restore wallet transaction ${result.target.id}`
        : colors.green(`Wallet transaction restored: id=${result.target.id}`),
    );
  },
});

const walletTransactionRegisterCommand = define({
  name: "register",
  description: "Register one unprocessed wallet transaction as a new Deal through freee Web",
  args: {
    ...globalArgs,
    "dry-run": {
      type: "boolean" as const,
      default: false,
      description: "Show freee's Deal registration preview without writing",
    },
    id: {
      type: "string" as const,
      description: "Wallet transaction ID from freee wallet-txn-list",
      required: true,
    },
    "account-item-name": {
      type: "string" as const,
      description: "Account item name exactly as shown by freee account-item-list",
      required: true,
    },
    "tax-name": {
      type: "string" as const,
      description: "Tax name exactly as shown by freee tax-code-list",
      required: true,
    },
    description: {
      type: "string" as const,
      description: "Optional replacement for the wallet transaction description",
    },
  },
  examples: `$ freee web wallet-txn register --id 42 --account-item-name "通信費" --tax-name "課対仕入10%" --description "クラウド利用料" --dry-run --format json`,
  run: async (context) => {
    const result = await runWalletTransactionRegisterCommand(context.values);
    return formatValue(
      result,
      context.values.format,
      "dryRun" in result
        ? `${colors.yellow("Dry run —")} would register wallet transaction ${result.target.id} as a new Deal`
        : colors.green(
            `Wallet transaction registered: id=${result.target.id} deal=${result.dealId}`,
          ),
    );
  },
});

const walletTransactionSettleCommand = define({
  name: "settle",
  description: "Settle one existing Deal with an unprocessed wallet transaction through freee Web",
  args: {
    ...globalArgs,
    "dry-run": {
      type: "boolean" as const,
      default: false,
      description: "Show freee's settlement preview without settling the Deal",
    },
    id: {
      type: "string" as const,
      description: "Wallet transaction ID from freee wallet-txn-list",
      required: true,
    },
    "deal-id": {
      type: "string" as const,
      description: "Existing Deal ID from freee deal-list",
      required: true,
    },
    amount: {
      type: "string" as const,
      description: "Positive settlement amount in yen",
      required: true,
    },
  },
  examples: `$ freee web wallet-txn settle --id 42 --deal-id 91 --amount 10000 --dry-run --format json`,
  run: async (context) => {
    const result = await runWalletTransactionSettleCommand(context.values);
    return formatValue(
      result,
      context.values.format,
      "dryRun" in result
        ? `${colors.yellow("Dry run —")} would settle wallet transaction ${result.target.id} against Deal ${result.dealId} for ${result.amount}`
        : colors.green(
            `Wallet transaction settled: id=${result.target.id} deal=${result.dealId} amount=${result.amount}`,
          ),
    );
  },
});

const walletTransactionTransferCommand = define({
  name: "transfer",
  description:
    "Process one unprocessed wallet transaction as an account transfer through freee Web",
  args: {
    ...globalArgs,
    "dry-run": {
      type: "boolean" as const,
      default: false,
      description: "Show freee's account transfer preview without writing",
    },
    id: {
      type: "string" as const,
      description: "Wallet transaction ID from freee wallet-txn-list",
      required: true,
    },
    "counterparty-walletable-name": {
      type: "string" as const,
      description:
        "Counterparty walletable or private-funds account name exactly as shown in freee",
      required: true,
    },
    description: {
      type: "string" as const,
      description: "Optional transfer description",
    },
  },
  examples: `$ freee web wallet-txn transfer --id 42 --counterparty-walletable-name "事業主借" --description "資金移動" --dry-run --format json`,
  run: async (context) => {
    const result = await runWalletTransactionTransferCommand(context.values);
    return formatValue(
      result,
      context.values.format,
      "dryRun" in result
        ? `${colors.yellow("Dry run —")} would process wallet transaction ${result.target.id} as a transfer with ${result.counterpartyWalletableName}`
        : colors.green(
            `Wallet transaction transferred: id=${result.target.id} counterparty=${result.counterpartyWalletableName}`,
          ),
    );
  },
});

const walletTransactionCommand = define({
  name: "wallet-txn",
  description: "Operate on wallet transactions through freee Web",
  subCommands: {
    "apply-rules": walletTransactionApplyRulesCommand,
    ignore: walletTransactionIgnoreCommand,
    register: walletTransactionRegisterCommand,
    restore: walletTransactionRestoreCommand,
    settle: walletTransactionSettleCommand,
    transfer: walletTransactionTransferCommand,
  },
  run: () => 'Run "freee web wallet-txn --help" for usage information.',
});

const walletableCommand = define({
  name: "walletable",
  description: "Operate on walletables through freee Web",
  subCommands: {
    sync: walletableSyncCommand,
  },
  run: () => 'Run "freee web walletable --help" for usage information.',
});

const invoiceCommand = define({
  name: "invoice",
  description: "Operate on invoices through freee Web",
  subCommands: {
    "register-deal": invoiceRegisterDealCommand,
  },
  run: () => 'Run "freee web invoice --help" for usage information.',
});

const webCommand = define({
  name: "web",
  description: "Experimental operations available only through freee Web",
  subCommands: {
    invoice: invoiceCommand,
    "wallet-txn": walletTransactionCommand,
    walletable: walletableCommand,
  },
  run: () => 'Run "freee web --help" for usage information.',
});

export const freeeWebPlugin = plugin({
  id: "freee:web",
  name: "freee Web Operations",
  setup: (context) => {
    context.addCommand("web", webCommand);
  },
});
