import { define } from "gunshi";
import { args, boolean, choice, integer, merge, required, withDefault } from "gunshi/combinators";
import colors from "yoctocolors";

import { globalArgs } from "../../global-args.ts";
import { formatOutput, formatValue } from "../../output/formatter.ts";
import { runInvoiceRegisterDealCommand } from "./invoice-register-deal-command.ts";
import { runInvoiceSetSendingStatusCommand } from "./invoice-set-sending-status-command.ts";
import { runWalletableSyncCommand } from "./walletable-sync-command.ts";

export const invoiceRegisterDealCommand = define({
  name: "register-deal",
  description: "Register a Deal from one unregistered invoice through freee Web",
  args: merge(
    globalArgs,
    args({
      id: required(
        integer({
          min: 1,
          max: Number.MAX_SAFE_INTEGER,
          description:
            "Invoice ID from freee invoice list --deal-status unregistered --cancel-status uncanceled",
        }),
      ),
    }),
  ),
  examples: `$ freee invoice register-deal --id 42 --format json`,
  run: async (context) => {
    const result = await runInvoiceRegisterDealCommand(context.values);
    return formatValue(
      result,
      context.values.format,
      colors.green(`Invoice Deal registered: invoice=${result.target.id} deal=${result.dealId}`),
    );
  },
});

export const invoiceSetSendingStatusCommand = define({
  name: "set-sending-status",
  description: "Set one invoice's sending status through freee Web without delivering it",
  args: merge(
    globalArgs,
    args({
      id: required(
        integer({
          min: 1,
          max: Number.MAX_SAFE_INTEGER,
          description: "Invoice ID from freee invoice list or freee invoice show",
        }),
      ),
      status: required(
        choice(["sent", "unsent"] as const, {
          description: "Desired sending status: sent | unsent",
        }),
      ),
    }),
  ),
  examples: `$ freee invoice set-sending-status --id 42 --status sent --format json`,
  run: async (context) => {
    const result = await runInvoiceSetSendingStatusCommand(context.values);
    const human = result.changed
      ? colors.green(
          `Invoice sending status changed: id=${result.target.id} ${result.before} -> ${result.after}`,
        )
      : colors.green(
          `Invoice sending status unchanged: id=${result.target.id} status=${result.after}`,
        );
    return formatValue(result, context.values.format, human);
  },
});

export const walletableSyncCommand = define({
  name: "sync",
  description:
    "Synchronize one walletable or start freee Web's bulk synchronization; may wait up to one hour and, in table format, reports progress lines on stderr",
  args: merge(
    globalArgs,
    args({
      all: withDefault(
        boolean({
          description: "Start bulk sync and report walletables that freee actually syncs",
        }),
        false,
      ),
      id: integer({
        min: 1,
        max: Number.MAX_SAFE_INTEGER,
        description: "Walletable ID from freee walletable list",
      }),
    }),
  ),
  examples: `$ freee walletable sync --id 42 --format json`,
  run: async (context) => {
    const result = await runWalletableSyncCommand(context.values);
    if (context.values.format === "json") return JSON.stringify(result, null, 2);
    return formatOutput(
      result.walletables.map((walletable) => ({ ...walletable })),
      "table",
    );
  },
});
