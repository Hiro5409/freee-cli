import { define } from "gunshi";
import colors from "yoctocolors";

import { client } from "../../api/client.ts";
import { writeArgs } from "../../global-args.ts";
import { initCommand, parseNonNegativeInteger, parsePositiveId } from "../../helpers.ts";
import { formatDryRun, formatValue } from "../../output/formatter.ts";
import { getDeal } from "../../types/freee/sdk.gen.ts";
import type { Deal, DealUpdateParams } from "../../types/freee/types.gen.ts";

type DealChanges = {
  description?: string;
  accountItemId?: number;
  taxCode?: number;
  receiptIds?: number[];
};

export function buildDealUpdateBody(
  current: Deal,
  companyId: number,
  changes: DealChanges,
): DealUpdateParams {
  if (!current.type) throw new Error("The deal type is unavailable; refusing a full replacement.");

  return {
    company_id: companyId,
    issue_date: current.issue_date,
    type: current.type,
    due_date: current.due_date,
    partner_id: current.partner_id ?? undefined,
    partner_code: current.partner_code ?? undefined,
    ref_number: current.ref_number,
    receipt_ids: changes.receiptIds ?? (current.receipts ?? []).map((receipt) => receipt.id),
    details: (current.details ?? []).map((detail) => ({
      id: detail.id,
      account_item_id: changes.accountItemId ?? detail.account_item_id,
      tax_code: changes.taxCode ?? detail.tax_code,
      amount: detail.amount,
      item_id: detail.item_id ?? undefined,
      section_id: detail.section_id ?? undefined,
      partner_id: detail.partner_id,
      tag_ids: detail.tag_ids,
      segment_1_tag_id: detail.segment_1_tag_id ?? undefined,
      segment_2_tag_id: detail.segment_2_tag_id ?? undefined,
      segment_3_tag_id: detail.segment_3_tag_id ?? undefined,
      description: changes.description ?? detail.description ?? "",
      ...(changes.taxCode === undefined ? { vat: detail.vat } : {}),
    })),
  };
}

function parseReceiptIds(value: string | undefined): number[] | undefined {
  if (value === undefined) return undefined;
  if (value.trim() === "") return [];
  return value.split(",").map((id) => parsePositiveId(id.trim(), "--receipt-ids"));
}

export const dealUpdateCommand = define({
  name: "deal-update",
  description: "Update an existing deal (fetch-merge-PUT)",
  args: {
    ...writeArgs,
    id: { type: "string" as const, description: "Deal ID", required: true },
    description: { type: "string" as const, description: "Update remarks/description" },
    "account-item-id": {
      type: "string" as const,
      description: "Apply account item ID to all lines",
    },
    "tax-code": { type: "string" as const, description: "Apply tax code to all lines" },
    "receipt-ids": {
      type: "string" as const,
      description: "Replace receipt IDs with a comma-separated list; empty clears them",
    },
  },
  examples: `$ freee deal-update --id 123 --description "August expense" --dry-run --format json`,
  run: async (ctx) => {
    const { companyId, format } = initCommand(ctx);
    const id = parsePositiveId(ctx.values.id, "--id");

    const { data } = await getDeal({ path: { id }, query: { company_id: companyId } });

    const current = data.deal;
    const body = buildDealUpdateBody(current, companyId, {
      description: ctx.values.description,
      accountItemId: ctx.values["account-item-id"]
        ? parsePositiveId(ctx.values["account-item-id"], "--account-item-id")
        : undefined,
      taxCode: ctx.values["tax-code"]
        ? parseNonNegativeInteger(ctx.values["tax-code"], "--tax-code")
        : undefined,
      receiptIds: parseReceiptIds(ctx.values["receipt-ids"]),
    });

    if (ctx.values["dry-run"]) {
      return formatDryRun(
        format,
        { method: "PUT", path: `/api/1/deals/${id}`, body },
        `${colors.yellow("Dry run —")} would PUT /api/1/deals/${id}: ${JSON.stringify(body, null, 2)}`,
      );
    }

    const updateRes = await client.put({
      url: `/api/1/deals/${id}`,
      body,
    });
    return formatValue(
      updateRes.data,
      format,
      `${colors.green("Deal updated:")} ${JSON.stringify(updateRes.data, null, 2)}`,
    );
  },
});
