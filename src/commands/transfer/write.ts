import { define } from "gunshi";
import { args, choice, integer, merge, multiple, required, string } from "gunshi/combinators";
import colors from "yoctocolors";

import { isoDateArg } from "../../cli-input.ts";
import { CliError, errorHints } from "../../errors.ts";
import { companyArgs, dryRunArgs } from "../../global-args.ts";
import { initCommand } from "../../helpers.ts";
import { formatDryRun } from "../../output/formatter.ts";
import { createTransfer, getTransfer, updateTransfer } from "../../types/freee/sdk.gen.ts";
import type { Transfer, TransferParams } from "../../types/freee/types.gen.ts";
import { parseTransferDestinations } from "./parse-destinations.ts";

const WALLET_TYPES = ["bank_account", "credit_card", "wallet"] as const;
const transferArgs = args({
  date: isoDateArg("--date", "Transfer date (YYYY-MM-DD)"),
  "from-walletable-id": integer({
    min: 1,
    max: Number.MAX_SAFE_INTEGER,
    description: "Source walletable ID",
  }),
  "from-walletable-type": choice(WALLET_TYPES, {
    description: `Source walletable type: ${WALLET_TYPES.join(" | ")}`,
  }),
  to: multiple(
    string({ description: "Destination JSON; repeatable and replaces all destinations on update" }),
  ),
});

type TransferValues = {
  date?: string;
  "from-walletable-id"?: number;
  "from-walletable-type"?: (typeof WALLET_TYPES)[number];
  to?: string[];
};

type LegacySingleDestinationKey =
  | "to_walletable_id"
  | "to_walletable_type"
  | "amount"
  | "description";
type CurrentTransferParams = Omit<TransferParams, LegacySingleDestinationKey>;
type FullTransferParams = {
  [K in keyof Required<CurrentTransferParams>]: CurrentTransferParams[K];
};
type TransferDestination = NonNullable<TransferParams["to_walletables"]>[number];
type FullTransferDestination = {
  [K in keyof Required<TransferDestination>]: TransferDestination[K];
};

function currentTransferBody(companyId: number, current: Transfer): TransferParams {
  return {
    company_id: companyId,
    date: current.date,
    from_walletable_id: current.from_walletable_id,
    from_walletable_type: current.from_walletable_type,
    from_partner_id: current.from_partner_id,
    from_section_id: current.from_section_id,
    from_item_id: current.from_item_id,
    from_tag_ids: current.from_tag_ids,
    from_segment_1_tag_id: current.from_segment_1_tag_id,
    from_segment_2_tag_id: current.from_segment_2_tag_id,
    from_segment_3_tag_id: current.from_segment_3_tag_id,
    to_walletables: current.to_walletables.map(
      (destination) =>
        ({
          type: destination.type,
          id: destination.id,
          amount: destination.amount,
          description: destination.description ?? undefined,
          partner_id: destination.partner_id,
          section_id: destination.section_id,
          item_id: destination.item_id,
          tag_ids: destination.tag_ids,
          segment_1_tag_id: destination.segment_1_tag_id,
          segment_2_tag_id: destination.segment_2_tag_id,
          segment_3_tag_id: destination.segment_3_tag_id,
        }) satisfies FullTransferDestination,
    ),
  } satisfies FullTransferParams;
}

function optionalOverrides(values: TransferValues): Partial<TransferParams> {
  const overrides: Partial<TransferParams> = {};
  if (values.date !== undefined) overrides.date = values.date;
  if (values["from-walletable-id"] !== undefined)
    overrides.from_walletable_id = values["from-walletable-id"];
  if (values["from-walletable-type"] !== undefined) {
    overrides.from_walletable_type = values["from-walletable-type"];
  }
  if (values.to !== undefined) overrides.to_walletables = parseTransferDestinations(values.to);
  return overrides;
}

export const transferCreateCommand = define({
  name: "transfer-create",
  description: "Create an account transfer",
  args: merge(
    companyArgs,
    transferArgs,
    args({
      date: required(transferArgs.date),
      "from-walletable-id": required(transferArgs["from-walletable-id"]),
      "from-walletable-type": required(transferArgs["from-walletable-type"]),
      to: required(transferArgs.to),
    }),
  ),
  examples: `$ freee transfer-create --date 2026-08-01 \\
    --from-walletable-id 10 --from-walletable-type bank_account \\
    --to '{"type":"credit_card","id":20,"amount":5000,"description":"Card payment"}' \\
    --format json`,
  run: async (ctx) => {
    const { companyId, format } = initCommand(ctx);
    const body = {
      company_id: companyId,
      date: ctx.values.date,
      from_walletable_id: ctx.values["from-walletable-id"],
      from_walletable_type: ctx.values["from-walletable-type"],
      to_walletables: parseTransferDestinations(ctx.values.to),
    } satisfies TransferParams;

    const { data } = await createTransfer({ body });
    if (format === "json") return JSON.stringify(data.transfer, null, 2);
    return colors.green(`Transfer created: id=${data.transfer.id}`);
  },
});

export const transferUpdateCommand = define({
  name: "transfer-update",
  description: "Update selected fields of an account transfer",
  args: merge(
    dryRunArgs,
    transferArgs,
    args({
      id: required(integer({ min: 1, max: Number.MAX_SAFE_INTEGER, description: "Transfer ID" })),
    }),
  ),
  examples: `$ freee transfer-update --id 42 --date 2026-08-02 --dry-run --format json`,
  run: async (ctx) => {
    const { companyId, format } = initCommand(ctx);
    const id = ctx.values.id;
    const overrides = optionalOverrides(ctx.values);
    if (Object.keys(overrides).length === 0) {
      throw new CliError("Pass at least one transfer field to update.", {
        code: "INVALID_INPUT",
        why: "A full-state PUT with no requested change is a no-op.",
        hint: errorHints.invalidValue,
      });
    }
    const { data } = await getTransfer({
      path: { id },
      query: { company_id: companyId },
    });
    const body: TransferParams = {
      ...currentTransferBody(companyId, data.transfer),
      ...overrides,
    };

    if (ctx.values["dry-run"]) {
      return formatDryRun(
        format,
        { method: "PUT", path: `/api/1/transfers/${id}`, body },
        `${colors.yellow("Dry run —")} would PUT /api/1/transfers/${id}: ${JSON.stringify(body, null, 2)}`,
      );
    }
    const { data: updated } = await updateTransfer({ path: { id }, body });
    if (format === "json") return JSON.stringify(updated.transfer, null, 2);
    return colors.green(`Transfer updated: id=${updated.transfer.id}`);
  },
});
