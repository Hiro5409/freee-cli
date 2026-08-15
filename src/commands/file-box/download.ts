import { existsSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { define } from "gunshi";
import colors from "yoctocolors";

import { CliError } from "../../errors.ts";
import { companyArgs } from "../../global-args.ts";
import { initCommand, parsePositiveId } from "../../helpers.ts";
import { formatValue } from "../../output/formatter.ts";
import { downloadReceipt } from "../../types/freee/sdk.gen.ts";

export const fileBoxDownloadCommand = define({
  name: "file-box-download",
  description: "Download a document from the File Box without overwriting an existing file",
  args: {
    ...companyArgs,
    id: { type: "string" as const, description: "File Box document ID", required: true },
    output: { type: "string" as const, description: "Output file path", required: true },
  },
  examples: `$ freee file-box-download --id 55 --output receipt.pdf --format json`,
  run: async (ctx) => {
    const { companyId, format } = initCommand(ctx);
    const id = parsePositiveId(ctx.values.id, "--id");
    const path = resolve(ctx.values.output);
    if (existsSync(path)) {
      throw new CliError(`Output path already exists: ${path}`, {
        code: "INVALID_INPUT",
        why: "freee-cli does not overwrite downloaded evidence files.",
        hint: "Choose a new --output path.",
      });
    }

    const result = await downloadReceipt({
      path: { id },
      query: { company_id: companyId },
      parseAs: "arrayBuffer",
    });
    const downloaded: unknown = result.data;
    if (!(downloaded instanceof ArrayBuffer)) {
      throw new CliError(`File Box document ${id} returned an invalid download response.`, {
        code: "UPSTREAM_FAILURE",
      });
    }
    const bytes = downloaded;
    writeFileSync(path, new Uint8Array(bytes), { flag: "wx" });

    const output = {
      id,
      path,
      mimeType: result.response.headers.get("Content-Type") ?? "application/octet-stream",
      bytes: bytes.byteLength,
    };
    return formatValue(
      output,
      format,
      colors.green(`File Box document ${id} downloaded to ${path}.`),
    );
  },
});
