import { define } from "gunshi";

import { fetchAll } from "../../api/paginate.ts";
import { CliError, errorHints } from "../../errors.ts";
import { listArgs } from "../../global-args.ts";
import {
  initCommand,
  monthToDateRange,
  parseChoice,
  parseLimit,
  parsePositiveId,
} from "../../helpers.ts";
import { formatOutput } from "../../output/formatter.ts";
import { getWalletTxns } from "../../types/freee/sdk.gen.ts";

const STATUSES = ["unreconciled", "reconciled", "ignored", "in-progress", "excluded"] as const;
const STATUS_CODES = {
  unreconciled: 1,
  reconciled: 2,
  ignored: 3,
  "in-progress": 4,
  excluded: 6,
} as const satisfies Record<(typeof STATUSES)[number], number>;
const WALLET_TYPES = ["bank_account", "credit_card", "wallet"] as const;
const ENTRY_SIDES = ["income", "expense"] as const;

export const walletTransactionListCommand = define({
  name: "wallet-txn-list",
  description: "List wallet transactions for a company",
  args: {
    ...listArgs,
    month: { type: "string" as const, description: "Filter by month (YYYY-MM)" },
    status: {
      type: "string" as const,
      description: `Filter locally by status: ${STATUSES.join(" | ")}`,
    },
    "walletable-id": { type: "string" as const, description: "Filter by walletable ID" },
    "walletable-type": {
      type: "string" as const,
      description: `Filter by walletable type: ${WALLET_TYPES.join(" | ")}`,
    },
    "entry-side": {
      type: "string" as const,
      description: `Filter by entry side: ${ENTRY_SIDES.join(" | ")}`,
    },
  },
  run: async (ctx) => {
    const { companyId, format } = initCommand(ctx);
    const monthFilter = ctx.values.month ? monthToDateRange(ctx.values.month) : undefined;
    const status = ctx.values.status
      ? parseChoice(ctx.values.status, STATUSES, "--status")
      : undefined;
    const limit = parseLimit(ctx.values.limit);
    const walletableId = ctx.values["walletable-id"];
    const walletableType = ctx.values["walletable-type"];
    if ((walletableId === undefined) !== (walletableType === undefined)) {
      throw new CliError("Pass --walletable-id and --walletable-type together.", {
        code: "INVALID_INPUT",
        why: "freee requires both fields when filtering by a walletable.",
        hint: errorHints.invalidValue,
      });
    }

    const txns = await fetchAll(
      async (offset, pageLimit) => {
        const { data } = await getWalletTxns({
          query: {
            company_id: companyId,
            offset,
            limit: pageLimit,
            start_date: monthFilter?.start,
            end_date: monthFilter?.end,
            walletable_id: walletableId
              ? parsePositiveId(walletableId, "--walletable-id")
              : undefined,
            walletable_type: walletableType
              ? parseChoice(walletableType, WALLET_TYPES, "--walletable-type")
              : undefined,
            entry_side: ctx.values["entry-side"]
              ? parseChoice(ctx.values["entry-side"], ENTRY_SIDES, "--entry-side")
              : undefined,
          },
        });
        return data.wallet_txns;
      },
      status ? undefined : limit,
    );

    const filtered = status ? txns.filter((txn) => txn.status === STATUS_CODES[status]) : txns;
    const limited = limit === undefined ? filtered : filtered.slice(0, limit);

    return formatOutput(limited, format);
  },
});
