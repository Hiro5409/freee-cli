import { define } from "gunshi";
import colors from "yoctocolors";

import { client } from "../api/client.ts";
import { writeArgs } from "../global-args.ts";
import { initCommand, parsePositiveId, stripDealReadOnly } from "../helpers.ts";
import { formatValue } from "../output/formatter.ts";
import { createReceipt, getDeal } from "../types/freee/sdk.gen.ts";

export const receiptAttachCommand = define({
  name: "receipt-attach",
  description: "Upload a receipt and attach it to a deal",
  args: {
    ...writeArgs,
    "deal-id": {
      type: "string" as const,
      description: "Deal ID to attach receipt to",
      required: true,
    },
    file: { type: "string" as const, description: "Receipt file path to upload", required: true },
    description: { type: "string" as const, description: "Receipt description" },
  },
  examples: `$ freee receipt-attach --deal-id 12345 --file receipt.jpg --dry-run --format json`,
  run: async (ctx) => {
    const { companyId, format } = initCommand(ctx);
    const dealId = parsePositiveId(ctx.values["deal-id"], "--deal-id");

    if (ctx.values["dry-run"]) {
      return formatValue(
        {
          dryRun: true,
          operations: [
            {
              method: "POST",
              path: "/api/1/receipts",
              body: {
                company_id: companyId,
                file: ctx.values.file,
                description: ctx.values.description,
              },
            },
            {
              method: "PUT",
              path: `/api/1/deals/${dealId}`,
              body: { attachUploadedReceipt: true },
            },
          ],
        },
        format,
        `${colors.yellow("Dry run —")} would upload and attach receipt: ${JSON.stringify({ dealId, file: ctx.values.file })}`,
      );
    }

    // Step 1: Upload receipt
    const { data: receiptData } = await createReceipt({
      body: {
        company_id: companyId,
        receipt: Bun.file(ctx.values.file),
        description: ctx.values.description,
      },
    });

    const receiptId = receiptData.receipt.id;
    // Step 2: Fetch current deal
    const { data: dealData } = await getDeal({
      path: { id: dealId },
      query: { company_id: companyId },
    });

    // Step 3: Attach receipt to deal
    const existingReceiptIds = (dealData.deal.receipts ?? []).map((r) => r.id);
    existingReceiptIds.push(receiptId);

    // fetch-merge-PUT: use raw client
    await client.put({
      url: `/api/1/deals/${dealId}`,
      body: stripDealReadOnly({
        ...dealData.deal,
        company_id: companyId,
        receipt_ids: existingReceiptIds,
      }),
    });

    return formatValue(
      { receiptId, dealId, attached: true },
      format,
      colors.green(`Receipt ${receiptId} attached to deal ${dealId}.`),
    );
  },
});
