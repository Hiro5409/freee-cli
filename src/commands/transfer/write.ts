import { define } from "gunshi";
import colors from "yoctocolors";

import { IsoDateSchema, PositiveIntegerTextSchema, parseCliInput } from "../../cli-input.ts";
import { CliError, errorHints } from "../../errors.ts";
import { writeArgs } from "../../global-args.ts";
import { initCommand } from "../../helpers.ts";
import { formatDryRun } from "../../output/formatter.ts";
import { createTransfer, getTransfer, updateTransfer } from "../../types/freee/sdk.gen.ts";
import type { Transfer, TransferParams } from "../../types/freee/types.gen.ts";
import { parseTransferDestinations } from "./parse-destinations.ts";

const WALLET_TYPES = ["bank_account", "credit_card", "wallet"] as const;
const transferArgs = {
  date: { type: "string" as const, description: "Transfer date (YYYY-MM-DD)" },
  "from-walletable-id": { type: "string" as const, description: "Source walletable ID" },
  "from-walletable-type": {
    type: "enum" as const,
    choices: WALLET_TYPES,
    description: `Source walletable type: ${WALLET_TYPES.join(" | ")}`,
  },
  to: {
    type: "string" as const,
    multiple: true as const,
    description: "Destination JSON; repeatable and replaces all destinations on update",
  },
};

type TransferValues = {
  date?: string;
  "from-walletable-id"?: string;
  "from-walletable-type"?: (typeof WALLET_TYPES)[number];
  to?: string[];
};

type FullTransferParams = { [K in keyof Required<TransferParams>]: TransferParams[K] };

function currentTransferBody(companyId: number, current: Transfer): TransferParams {
  return {
    company_id: companyId,
    date: current.date,
    from_walletable_id: current.from_walletable_id,
    from_walletable_type: current.from_walletable_type,
    to_walletables: current.to_walletables.map((destination) => ({
      type: destination.type,
      id: destination.id,
      amount: destination.amount,
      description: destination.description ?? undefined,
    })),
    /* oxlint-disable typescript/no-deprecated -- Explicit legacy keys make schema additions fail type-checking while JSON omits these mutually exclusive fields. */
    to_walletable_id: undefined,
    to_walletable_type: undefined,
    amount: undefined,
    description: undefined,
    /* oxlint-enable typescript/no-deprecated */
  } satisfies FullTransferParams;
}

function optionalOverrides(values: TransferValues): Partial<TransferParams> {
  const overrides: Partial<TransferParams> = {};
  if (values.date !== undefined)
    overrides.date = parseCliInput(IsoDateSchema, values.date, { label: "--date" });
  if (values["from-walletable-id"] !== undefined) {
    overrides.from_walletable_id = parseCliInput(
      PositiveIntegerTextSchema,
      values["from-walletable-id"],
      { label: "--from-walletable-id" },
    );
  }
  if (values["from-walletable-type"] !== undefined) {
    overrides.from_walletable_type = values["from-walletable-type"];
  }
  if (values.to !== undefined) overrides.to_walletables = parseTransferDestinations(values.to);
  return overrides;
}

export const transferCreateCommand = define({
  name: "transfer-create",
  description: "Create an account transfer",
  args: {
    ...writeArgs,
    ...transferArgs,
    date: { ...transferArgs.date, required: true },
    "from-walletable-id": { ...transferArgs["from-walletable-id"], required: true },
    "from-walletable-type": { ...transferArgs["from-walletable-type"], required: true },
    to: { ...transferArgs.to, required: true },
  },
  examples: `$ freee transfer-create --date 2026-08-01 \\
    --from-walletable-id 10 --from-walletable-type bank_account \\
    --to '{"type":"credit_card","id":20,"amount":5000,"description":"Card payment"}' \\
    --dry-run --format json`,
  run: async (ctx) => {
    const { companyId, format } = initCommand(ctx);
    const body = {
      company_id: companyId,
      date: parseCliInput(IsoDateSchema, ctx.values.date, { label: "--date" }),
      from_walletable_id: parseCliInput(
        PositiveIntegerTextSchema,
        ctx.values["from-walletable-id"],
        { label: "--from-walletable-id" },
      ),
      from_walletable_type: ctx.values["from-walletable-type"],
      to_walletables: parseTransferDestinations(ctx.values.to),
    } satisfies TransferParams;

    if (ctx.values["dry-run"]) {
      return formatDryRun(
        format,
        { method: "POST", path: "/api/1/transfers", body },
        `${colors.yellow("Dry run —")} would POST /api/1/transfers: ${JSON.stringify(body, null, 2)}`,
      );
    }
    const { data } = await createTransfer({ body });
    if (format === "json") return JSON.stringify(data.transfer, null, 2);
    return colors.green(`Transfer created: id=${data.transfer.id}`);
  },
});

export const transferUpdateCommand = define({
  name: "transfer-update",
  description: "Update selected fields of an account transfer",
  args: {
    ...writeArgs,
    ...transferArgs,
    id: { type: "string" as const, description: "Transfer ID", required: true },
  },
  examples: `$ freee transfer-update --id 42 --date 2026-08-02 --dry-run --format json`,
  run: async (ctx) => {
    const { companyId, format } = initCommand(ctx);
    const id = parseCliInput(PositiveIntegerTextSchema, ctx.values.id, { label: "--id" });
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
