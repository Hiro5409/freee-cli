import { define } from "gunshi";

import { fetchAll } from "../../api/paginate.ts";
import { CliError } from "../../errors.ts";
import { listArgs } from "../../global-args.ts";
import {
  initCommand,
  monthToDateRange,
  parseChoice,
  parseLimit,
  parsePositiveId,
} from "../../helpers.ts";
import { formatOutput } from "../../output/formatter.ts";
import { invoicesIndex } from "../../types/freee-invoice/sdk.gen.ts";

const SENDING_STATUSES = ["sent", "unsent"] as const;
const DEAL_STATUSES = ["registered", "unregistered"] as const;
const PAYMENT_STATUSES = ["settled", "unsettled", "canceled", "unprocessed", "failed"] as const;
const CANCEL_STATUSES = ["canceled", "uncanceled"] as const;

function parsePartnerIds(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const ids = value.split(",").map((id) => parsePositiveId(id.trim(), "--partner-ids"));
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
      type: "string" as const,
      description: "Sending status: sent | unsent",
    },
    "deal-status": {
      type: "string" as const,
      description: "Deal registration status: registered | unregistered",
    },
    "payment-status": {
      type: "string" as const,
      description: "Payment status: settled | unsettled | canceled | unprocessed | failed",
    },
    "cancel-status": {
      type: "string" as const,
      description: "Cancellation status: canceled | uncanceled",
    },
    "partner-ids": {
      type: "string" as const,
      description: "Comma-separated partner IDs (max 3)",
    },
  },
  run: async (ctx) => {
    const { companyId, format } = initCommand(ctx);
    const month = ctx.values.month ? monthToDateRange(ctx.values.month) : undefined;

    const query = {
      company_id: companyId,
      start_billing_date: month?.start,
      end_billing_date: month?.end,
      partner_ids: parsePartnerIds(ctx.values["partner-ids"]),
      sending_status: ctx.values["sending-status"]
        ? parseChoice(ctx.values["sending-status"], SENDING_STATUSES, "--sending-status")
        : undefined,
      deal_status: ctx.values["deal-status"]
        ? parseChoice(ctx.values["deal-status"], DEAL_STATUSES, "--deal-status")
        : undefined,
      payment_status: ctx.values["payment-status"]
        ? parseChoice(ctx.values["payment-status"], PAYMENT_STATUSES, "--payment-status")
        : undefined,
      cancel_status: ctx.values["cancel-status"]
        ? parseChoice(ctx.values["cancel-status"], CANCEL_STATUSES, "--cancel-status")
        : undefined,
    };

    const invoices = await fetchAll(async (offset, limit) => {
      const { data } = await invoicesIndex({ query: { ...query, offset, limit } });
      return data.invoices;
    }, parseLimit(ctx.values.limit));

    return formatOutput(invoices, format);
  },
});
