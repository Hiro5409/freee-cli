import { existsSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { define } from "gunshi";
import { args, integer, merge, required, string } from "gunshi/combinators";

import { CliError } from "../../errors.ts";
import { companyArgs } from "../../global-args.ts";
import { initCommand } from "../../helpers.ts";
import { downloadReceipt } from "../../types/freee/sdk.gen.ts";

export const fileBoxDownloadCommand = define({
  name: "download",
  description: "Download a document from the File Box without overwriting an existing file",
  args: merge(
    companyArgs,
    args({
      id: required(
        integer({ min: 1, max: Number.MAX_SAFE_INTEGER, description: "File Box document ID" }),
      ),
      output: required(string({ description: "Output file path" })),
    }),
  ),
  examples: `$ freee file-box download --id 55 --output receipt.pdf`,
  run: async (ctx) => {
    const { companyId } = initCommand(ctx);
    const id = ctx.values.id;
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
    return JSON.stringify(output);
  },
});
