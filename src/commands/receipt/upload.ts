import { define } from "gunshi";
import colors from "yoctocolors";

import { writeArgs } from "../../global-args.ts";
import { initCommand } from "../../helpers.ts";
import { formatDryRun, formatValue } from "../../output/formatter.ts";
import { createReceipt } from "../../types/freee/sdk.gen.ts";

export const receiptUploadCommand = define({
  name: "receipt-upload",
  description: "Upload a receipt file",
  args: {
    ...writeArgs,
    file: { type: "string" as const, description: "File path to upload", required: true },
    description: { type: "string" as const, description: "Receipt description" },
  },
  examples: `$ freee receipt-upload --file receipt.jpg --dry-run --format json`,
  run: async (ctx) => {
    const { companyId, format } = initCommand(ctx);
    const preview = {
      company_id: companyId,
      file: ctx.values.file,
      description: ctx.values.description,
    };

    if (ctx.values["dry-run"]) {
      return formatDryRun(
        format,
        { method: "POST", path: "/api/1/receipts", body: preview },
        `${colors.yellow("Dry run —")} would upload: ${ctx.values.file}`,
      );
    }

    const { data } = await createReceipt({
      body: {
        company_id: companyId,
        receipt: Bun.file(ctx.values.file),
        description: ctx.values.description,
      },
    });
    return formatValue(
      data,
      format,
      `${colors.green("Receipt uploaded:")} ${JSON.stringify(data, null, 2)}`,
    );
  },
});
