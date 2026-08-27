import { define } from "gunshi";

import { fetchAll } from "../../api/paginate.ts";
import {
  MonthTextSchema,
  OptionalLimitTextSchema,
  PositiveIntegerTextSchema,
  parseCliInput,
} from "../../cli-input.ts";
import { CliError } from "../../errors.ts";
import { listArgs } from "../../global-args.ts";
import { initCommand, monthToDateRange } from "../../helpers.ts";
import { formatOutput } from "../../output/formatter.ts";
import { invoicesIndex } from "../../types/freee-invoice/sdk.gen.ts";

const SENDING_STATUSES = ["sent", "unsent"] as const;
const DEAL_STATUSES = ["registered", "unregistered"] as const;
const PAYMENT_STATUSES = ["settled", "unsettled", "canceled", "unprocessed", "failed"] as const;
const CANCEL_STATUSES = ["canceled", "uncanceled"] as const;

function parsePartnerIds(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const ids = value
    .split(",")
    .map((id) => parseCliInput(PositiveIntegerTextSchema, id.trim(), { label: "--partner-ids" }));
  if (ids.length > 3) {
    throw new CliError("--partner-ids accepts at most 3 IDs.", { code: "INVALID_INPUT" });
  }
  return ids.join(",");
}

export const invoiceListCommand = define({
  name: "invoice-list",
  description: "List invoices from the freee invoice API",
  args: {
    ...listArgs,
    month: { type: "string" as const, description: "Filter by billing month (YYYY-MM)" },
    "sending-status": {
      type: "enum" as const,
      choices: SENDING_STATUSES,
      description: "Sending status: sent | unsent",
    },
    "deal-status": {
      type: "enum" as const,
      choices: DEAL_STATUSES,
      description: "Deal registration status: registered | unregistered",
    },
    "payment-status": {
      type: "enum" as const,
      choices: PAYMENT_STATUSES,
      description: "Payment status: settled | unsettled | canceled | unprocessed | failed",
    },
    "cancel-status": {
      type: "enum" as const,
      choices: CANCEL_STATUSES,
      description: "Cancellation status: canceled | uncanceled",
    },
    "partner-ids": {
      type: "string" as const,
      description: "Comma-separated partner IDs (max 3)",
    },
  },
  run: async (ctx) => {
    const { companyId, format } = initCommand(ctx);
    const month = ctx.values.month
      ? monthToDateRange(parseCliInput(MonthTextSchema, ctx.values.month, { label: "--month" }))
      : undefined;

    const query = {
      company_id: companyId,
      start_billing_date: month?.start,
      end_billing_date: month?.end,
      partner_ids: parsePartnerIds(ctx.values["partner-ids"]),
      sending_status: ctx.values["sending-status"],
      deal_status: ctx.values["deal-status"],
      payment_status: ctx.values["payment-status"],
      cancel_status: ctx.values["cancel-status"],
    };

    const invoices = await fetchAll(
      async (offset, limit) => {
        const { data } = await invoicesIndex({ query: { ...query, offset, limit } });
        return data.invoices;
      },
      parseCliInput(OptionalLimitTextSchema, ctx.values.limit, { label: "--limit" }),
    );

    return formatOutput(invoices, format);
  },
});
