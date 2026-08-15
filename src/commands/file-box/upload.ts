import { statSync } from "node:fs";

import { define } from "gunshi";
import colors from "yoctocolors";

import { CliError } from "../../errors.ts";
import { writeArgs } from "../../global-args.ts";
import { initCommand } from "../../helpers.ts";
import { formatDryRun, formatValue } from "../../output/formatter.ts";
import { createReceipt } from "../../types/freee/sdk.gen.ts";

const FILE_SIZE_LIMIT_BYTES = 64 * 1024 * 1024;

function validateDocument(path: string): Bun.BunFile {
  let stat;
  try {
    stat = statSync(path);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new CliError(`Cannot read File Box document ${path}: ${detail}`, {
      code: "INVALID_INPUT",
    });
  }
  if (!stat.isFile()) {
    throw new CliError(`File Box document path is not a regular file: ${path}`, {
      code: "INVALID_INPUT",
    });
  }
  if (stat.size > FILE_SIZE_LIMIT_BYTES) {
    throw new CliError(`File Box document exceeds the freee API limit of 64 MB: ${path}`, {
      code: "INVALID_INPUT",
    });
  }
  return Bun.file(path);
}

export const fileBoxUploadCommand = define({
  name: "file-box-upload",
  description: "Upload a document into the File Box",
  args: {
    ...writeArgs,
    file: { type: "string" as const, description: "File path to upload", required: true },
    description: { type: "string" as const, description: "Document description" },
  },
  examples: `$ freee file-box-upload --file receipt.jpg --dry-run --format json`,
  run: async (ctx) => {
    const { companyId, format } = initCommand(ctx);
    const preview = {
      company_id: companyId,
      file: ctx.values.file,
      description: ctx.values.description,
    };
    const document = validateDocument(ctx.values.file);

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
        receipt: document,
        description: ctx.values.description,
      },
    });
    return formatValue(
      data.receipt,
      format,
      `${colors.green("File Box document uploaded:")} ${JSON.stringify(data.receipt, null, 2)}`,
    );
  },
});
