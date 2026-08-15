import { define } from "gunshi";
import colors from "yoctocolors";
import * as z from "zod/mini";

import { CliError, errorHints } from "../../errors.ts";
import { writeArgs } from "../../global-args.ts";
import { initCommand, parsePositiveId } from "../../helpers.ts";
import { formatDryRun, formatValue } from "../../output/formatter.ts";
import { getDeal, updateDeal } from "../../types/freee/sdk.gen.ts";
import type { Deal, DealUpdateParams } from "../../types/freee/types.gen.ts";

const Integer = z.number().check(z.int());
const PositiveInteger = z.number().check(z.int(), z.positive());
const NonNegativeInteger = z.number().check(z.int(), z.nonnegative());
const DetailSchema = z.strictObject({
  id: z.optional(PositiveInteger),
  tax_code: NonNegativeInteger,
  account_item_id: PositiveInteger,
  amount: Integer,
  item_id: z.optional(PositiveInteger),
  section_id: z.optional(PositiveInteger),
  partner_id: z.optional(z.nullable(PositiveInteger)),
  tag_ids: z.optional(z.array(PositiveInteger)),
  segment_1_tag_id: z.optional(PositiveInteger),
  segment_2_tag_id: z.optional(PositiveInteger),
  segment_3_tag_id: z.optional(PositiveInteger),
  description: z.optional(z.string()),
  vat: z.optional(Integer),
});

function parseDealDetails(values: string[]): DealUpdateParams["details"] {
  return values.map((value, index) => {
    const label = `--detail #${index + 1}`;
    let json: unknown;
    try {
      json = JSON.parse(value);
    } catch {
      throw new CliError(`${label} is not valid JSON: ${value}`, {
        code: "INVALID_INPUT",
        why: "Each --detail takes one JSON object matching freee's deal detail fields.",
        hint: errorHints.invalidValue,
      });
    }

    const result = DetailSchema.safeParse(json);
    if (!result.success) {
      throw new CliError(`${label} is invalid: ${z.prettifyError(result.error)}`, {
        code: "INVALID_INPUT",
        why: "The detail does not match freee's deal detail schema.",
        hint: errorHints.invalidValue,
      });
    }
    return result.data;
  });
}

function parseReceiptIds(value: string | undefined): number[] | undefined {
  if (value === undefined) return undefined;
  if (value.trim() === "") return [];
  return value.split(",").map((id) => parsePositiveId(id.trim(), "--receipt-ids"));
}

function dealRequestFromCurrent(
  current: Deal,
  companyId: number,
  details: DealUpdateParams["details"] | undefined,
  receiptIds: number[] | undefined,
): DealUpdateParams {
  if (!current.type) throw new Error("The deal type is unavailable; refusing a full replacement.");

  return {
    company_id: companyId,
    issue_date: current.issue_date,
    type: current.type,
    ...(current.due_date === null || current.due_date === undefined
      ? {}
      : { due_date: current.due_date }),
    ...(current.partner_id !== null
      ? { partner_id: current.partner_id }
      : current.partner_code
        ? { partner_code: current.partner_code }
        : {}),
    ...(current.ref_number === null || current.ref_number === undefined
      ? {}
      : { ref_number: current.ref_number }),
    ...(receiptIds === undefined ? {} : { receipt_ids: receiptIds }),
    details:
      details ??
      (current.details ?? []).map((detail) => ({
        id: detail.id,
        account_item_id: detail.account_item_id,
        tax_code: detail.tax_code,
        amount: detail.amount,
        item_id: detail.item_id ?? undefined,
        section_id: detail.section_id ?? undefined,
        partner_id: detail.partner_id,
        tag_ids: detail.tag_ids,
        segment_1_tag_id: detail.segment_1_tag_id ?? undefined,
        segment_2_tag_id: detail.segment_2_tag_id ?? undefined,
        segment_3_tag_id: detail.segment_3_tag_id ?? undefined,
        description: detail.description ?? "",
        vat: detail.vat,
      })),
  };
}

export const dealUpdateCommand = define({
  name: "deal-update",
  description: "Update a deal; omit replacement fields to preserve their current values",
  args: {
    ...writeArgs,
    id: { type: "string" as const, description: "Deal ID", required: true },
    detail: {
      type: "string" as const,
      multiple: true as const,
      description:
        'Deal detail as JSON, repeatable; supplied details replace the entire array. e.g. \'{"id":10,"account_item_id":101,"tax_code":21,"amount":5000}\'',
    },
    "receipt-ids": {
      type: "string" as const,
      description: "Replace File Box document IDs; an empty value clears them",
    },
  },
  examples: `$ freee deal-update --id 123 \\
    --detail '{"id":10,"account_item_id":101,"tax_code":21,"amount":5000}' \\
    --dry-run --format json`,
  run: async (ctx) => {
    const { companyId, format } = initCommand(ctx);
    const id = parsePositiveId(ctx.values.id, "--id");
    const details = ctx.values.detail?.length ? parseDealDetails(ctx.values.detail) : undefined;
    const receiptIds = parseReceiptIds(ctx.values["receipt-ids"]);

    const { data: currentData } = await getDeal({
      path: { id },
      query: { company_id: companyId },
    });

    const current = currentData.deal;
    const body = dealRequestFromCurrent(current, companyId, details, receiptIds);

    if (ctx.values["dry-run"]) {
      return formatDryRun(
        format,
        { method: "PUT", path: `/api/1/deals/${id}`, body },
        `${colors.yellow("Dry run —")} would PUT /api/1/deals/${id}: ${JSON.stringify(body, null, 2)}`,
      );
    }

    const { data: updatedData } = await updateDeal({ path: { id }, body });
    const updated = updatedData.deal;
    return formatValue(
      updated,
      format,
      `${colors.green("Deal updated:")} ${JSON.stringify(updated, null, 2)}`,
    );
  },
});
