import { existsSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { define } from "gunshi";
import colors from "yoctocolors";

import { IsoDateSchema, parseCliInput } from "../../cli-input.ts";
import { CliError, errorHints } from "../../errors.ts";
import { companyArgs } from "../../global-args.ts";
import { initCommand } from "../../helpers.ts";
import { formatValue } from "../../output/formatter.ts";
import { downloadJournal, getJournals, getJournalStatus } from "../../types/freee/sdk.gen.ts";
import type { GetJournalsData } from "../../types/freee/types.gen.ts";

const DOWNLOAD_TYPES = ["generic", "generic_v2", "csv", "pdf"] as const;
const ENCODINGS = ["sjis", "utf-8"] as const;
const VISIBLE_TAGS = [
  "partner",
  "item",
  "tag",
  "section",
  "description",
  "wallet_txn_description",
  "segment_1_tag",
  "segment_2_tag",
  "segment_3_tag",
  "all",
] as const;
const VISIBLE_IDS = ["deal_id", "transfer_id", "manual_journal_id"] as const;

async function waitForJournal(companyId: number, reportId: number): Promise<void> {
  const maxAttempts = 60;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const { data } = await getJournalStatus({
      path: { id: reportId },
      query: { company_id: companyId },
    });
    if (data.journals.status === "uploaded") return;
    if (data.journals.status === "failed") {
      throw new CliError(`Journal report ${reportId} failed.`, {
        code: "UPSTREAM_FAILURE",
        why: "freee could not generate the requested journal export.",
        hint: errorHints.retryLater,
      });
    }
    if (attempt < maxAttempts) await Bun.sleep(1_000);
  }

  throw new CliError(`Journal report ${reportId} was not ready after 60 seconds.`, {
    code: "UPSTREAM_FAILURE",
    why: "freee generates journal exports asynchronously.",
    hint: errorHints.retryLater,
  });
}

export const journalExportCommand = define({
  name: "journal-export",
  description: "Generate and download a journal export",
  args: {
    ...companyArgs,
    "download-type": {
      type: "enum" as const,
      choices: DOWNLOAD_TYPES,
      description: `Export format: ${DOWNLOAD_TYPES.join(" | ")}`,
      required: true,
    },
    encoding: {
      type: "enum" as const,
      choices: ENCODINGS,
      description: `Character encoding: ${ENCODINGS.join(" | ")}`,
    },
    "start-date": { type: "string" as const, description: "Range start (YYYY-MM-DD)" },
    "end-date": { type: "string" as const, description: "Range end (YYYY-MM-DD)" },
    "visible-tag": {
      type: "enum" as const,
      choices: VISIBLE_TAGS,
      multiple: true as const,
      description: `Additional tag field, repeatable: ${VISIBLE_TAGS.join(" | ")}`,
    },
    "visible-id": {
      type: "enum" as const,
      choices: VISIBLE_IDS,
      multiple: true as const,
      description: `Additional ID field, repeatable: ${VISIBLE_IDS.join(" | ")}`,
    },
    output: {
      type: "string" as const,
      description: "Output file path",
      required: true,
    },
  },
  examples: `$ freee journal-export --download-type generic_v2 --encoding utf-8 \\
    --start-date 2025-01-01 --end-date 2025-12-31 \\
    --output journal-2025.csv --format json`,
  run: async (ctx) => {
    const { companyId, format } = initCommand(ctx);
    const path = resolve(ctx.values.output);
    if (existsSync(path)) {
      throw new CliError(`Output path already exists: ${path}`, {
        code: "INVALID_INPUT",
        why: "freee-cli does not overwrite exported accounting data.",
        hint: "Choose a new --output path.",
      });
    }

    const downloadType = ctx.values["download-type"];
    const encoding = ctx.values.encoding;
    const startDate = ctx.values["start-date"]
      ? parseCliInput(IsoDateSchema, ctx.values["start-date"], { label: "--start-date" })
      : undefined;
    const endDate = ctx.values["end-date"]
      ? parseCliInput(IsoDateSchema, ctx.values["end-date"], { label: "--end-date" })
      : undefined;
    const visibleTags = ctx.values["visible-tag"];
    const visibleIds = ctx.values["visible-id"];
    const query: GetJournalsData["query"] = {
      company_id: companyId,
      download_type: downloadType,
      encoding,
      start_date: startDate,
      end_date: endDate,
      "visible_tags[]": visibleTags,
      "visible_ids[]": visibleIds,
    };
    const { data: request } = await getJournals({
      query,
    });
    const reportId = request.journals.id;

    await waitForJournal(companyId, reportId);
    const { data } = await downloadJournal({
      path: { id: reportId },
      query: { company_id: companyId },
      parseAs: "arrayBuffer",
    });
    const downloaded: unknown = data;
    if (!(downloaded instanceof ArrayBuffer)) {
      throw new CliError(`Journal report ${reportId} returned an invalid download response.`, {
        code: "UPSTREAM_FAILURE",
      });
    }
    writeFileSync(path, new Uint8Array(downloaded), { flag: "wx" });

    const output = {
      reportId,
      path,
      downloadType,
      encoding: encoding ?? null,
      startDate: startDate ?? null,
      endDate: endDate ?? null,
      bytes: downloaded.byteLength,
      upToDate: request.journals.up_to_date,
      upToDateReasons: request.journals.up_to_date_reasons,
    };
    return formatValue(
      output,
      format,
      colors.green(`Journal report ${reportId} exported to ${path}.`),
    );
  },
});
