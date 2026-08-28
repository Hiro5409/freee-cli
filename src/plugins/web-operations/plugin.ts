import { define } from "gunshi";
import { plugin } from "gunshi/plugin";

import { globalArgs } from "../../global-args.ts";
import { formatOutput } from "../../output/formatter.ts";
import { runWalletableSyncCommand } from "./walletable-sync-command.ts";

const walletableSyncCommand = define({
  name: "walletable-sync",
  description: "Synchronize one walletable or start and wait for freee Web's bulk synchronization",
  args: {
    ...globalArgs,
    "dry-run": {
      type: "boolean" as const,
      default: false,
      description: "List the walletables that would be requested without starting synchronization",
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
  run: async (context) => {
    const result = await runWalletableSyncCommand(context.values);
    if (context.values.format === "json") return JSON.stringify(result, null, 2);
    return formatOutput(
      result.walletables.map((walletable) => ({ ...walletable })),
      "table",
    );
  },
});

const webCommand = define({
  name: "web",
  description: "Experimental operations available only through freee Web",
  subCommands: {
    "walletable-sync": walletableSyncCommand,
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
