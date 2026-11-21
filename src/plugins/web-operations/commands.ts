import { define } from "gunshi";
import { args, boolean, choice, integer, merge, required, withDefault } from "gunshi/combinators";

import { globalArgs } from "../../global-args.ts";
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
            "Invoice ID from freee invoice invoice list --deal-status unregistered --cancel-status uncanceled",
        }),
      ),
    }),
  ),
  examples: `$ freee web invoice register-deal --id 42`,
  run: async (context) => JSON.stringify(await runInvoiceRegisterDealCommand(context.values)),
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
          description: "Invoice ID from freee invoice invoice list or freee invoice invoice show",
        }),
      ),
      status: required(
        choice(["sent", "unsent"] as const, { description: "Desired sending status" }),
      ),
    }),
  ),
  examples: `$ freee web invoice set-sending-status --id 42 --status sent`,
  run: async (context) => JSON.stringify(await runInvoiceSetSendingStatusCommand(context.values)),
});

export const walletableSyncCommand = define({
  name: "sync",
  description:
    "Synchronize one walletable or start freee Web's bulk synchronization; may wait up to one hour",
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
        description: "Walletable ID from freee accounting walletable list",
      }),
    }),
  ),
  examples: `$ freee web walletable sync --id 42`,
  run: async (context) => JSON.stringify(await runWalletableSyncCommand(context.values)),
});
