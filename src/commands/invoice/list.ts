import { define } from "gunshi";

import { fetchAll } from "../../api/paginate.ts";
import { companyArgs } from "../../global-args.ts";
import { initCommand, monthToDateRange, parseChoice } from "../../helpers.ts";
import { formatOutput } from "../../output/formatter.ts";
import { invoicesIndex } from "../../types/freee-invoice/sdk.gen.ts";
import { invoiceApiError } from "./invoice-api-error.ts";

const SENDING_STATUSES = ["sent", "unsent"] as const;
const DEAL_STATUSES = ["registered", "unregistered"] as const;
const PAYMENT_STATUSES = ["settled", "unsettled", "canceled", "unprocessed", "failed"] as const;
const CANCEL_STATUSES = ["canceled", "uncanceled"] as const;

export const invoiceListCommand = define({
  name: "invoice-list",
  description: "List invoices from the freee invoice API",
  args: {
    ...companyArgs,
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
      partner_ids: ctx.values["partner-ids"],
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

    try {
      const invoices = await fetchAll(async (offset, limit) => {
        const { data } = await invoicesIndex({ query: { ...query, offset, limit } });
        return data.invoices;
      });

      return formatOutput(invoices, format);
    } catch (e) {
      throw invoiceApiError(e);
    }
  },
});
