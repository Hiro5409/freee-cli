import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { cli } from "gunshi";
import { HttpResponse } from "msw";
import { setupServer } from "msw/node";

import { MOCK_TOKEN } from "../../../test/credentials.ts";
import { saveCredentials } from "../../config/credentials.ts";
import {
  handleDownloadJournal,
  handleGetJournals,
  handleGetJournalStatus,
} from "../../types/freee/msw.gen.ts";
import { journalExportCommand } from "./export.ts";

const testDir = join(tmpdir(), `freee-cli-journal-export-test-${Date.now()}`);
const csv = "No.,取引日\n1,2025/01/02\n";

let requestUrl = "";
let journalRequestCount = 0;
const server = setupServer(
  handleGetJournals(({ request }) => {
    requestUrl = request.url;
    journalRequestCount += 1;
    return HttpResponse.json(
      {
        journals: {
          id: 91,
          company_id: 123,
          download_type: "generic_v2",
          up_to_date: false,
          up_to_date_reasons: [{ code: "depreciation_creating", message: "In progress" }],
        },
      },
      { status: 202 },
    );
  }),
  handleGetJournalStatus(({ params }) =>
    HttpResponse.json({
      journals: {
        id: Number(params.id),
        company_id: 123,
        download_type: "generic_v2",
        status: "uploaded",
        start_date: "2025-01-01",
        end_date: "2025-12-31",
      },
    }),
  ),
  handleDownloadJournal(() => HttpResponse.arrayBuffer(new TextEncoder().encode(csv).buffer)),
);

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterAll(() => server.close());
beforeEach(() => {
  mkdirSync(testDir, { recursive: true });
  saveCredentials(testDir, { default: MOCK_TOKEN });
  process.env.FREEE_CLI_CONFIG_DIR = testDir;
  requestUrl = "";
  journalRequestCount = 0;
});
afterEach(() => {
  server.resetHandlers();
  delete process.env.FREEE_CLI_CONFIG_DIR;
  rmSync(testDir, { recursive: true, force: true });
});

describe("journal export command", () => {
  test("passes export options through and writes the journal without interpreting it", async () => {
    const outputPath = join(testDir, "journal-2025.csv");
    const result = await cli(
      [
        "--company-id",
        "123",
        "--download-type",
        "csv",
        "--encoding",
        "sjis",
        "--start-date",
        "2025-04-01",
        "--end-date",
        "2026-03-31",
        "--visible-tag",
        "partner",
        "--visible-tag",
        "description",
        "--visible-id",
        "deal_id",
        "--output",
        outputPath,
        "--format",
        "json",
      ],
      journalExportCommand,
    );

    const url = new URL(requestUrl);
    expect(url.searchParams.get("company_id")).toBe("123");
    expect(url.searchParams.get("download_type")).toBe("csv");
    expect(url.searchParams.get("encoding")).toBe("sjis");
    expect(url.searchParams.get("start_date")).toBe("2025-04-01");
    expect(url.searchParams.get("end_date")).toBe("2026-03-31");
    expect(url.searchParams.getAll("visible_tags[]")).toEqual(["partner", "description"]);
    expect(url.searchParams.getAll("visible_ids[]")).toEqual(["deal_id"]);
    expect(journalRequestCount).toBe(1);
    expect(readFileSync(outputPath, "utf8")).toBe(csv);

    if (typeof result !== "string") throw new Error("expected string result");
    expect(JSON.parse(result)).toEqual({
      reportId: 91,
      path: resolve(outputPath),
      downloadType: "csv",
      encoding: "sjis",
      startDate: "2025-04-01",
      endDate: "2026-03-31",
      bytes: new TextEncoder().encode(csv).byteLength,
      upToDate: false,
      upToDateReasons: [{ code: "depreciation_creating", message: "In progress" }],
    });
  });

  test("does not invent optional export filters", async () => {
    const outputPath = join(testDir, "journal.pdf");
    await cli(
      ["--company-id", "123", "--download-type", "pdf", "--output", outputPath],
      journalExportCommand,
    );

    const url = new URL(requestUrl);
    expect(url.searchParams.has("encoding")).toBe(false);
    expect(url.searchParams.has("start_date")).toBe(false);
    expect(url.searchParams.has("end_date")).toBe(false);
    expect(url.searchParams.has("visible_tags[]")).toBe(false);
    expect(url.searchParams.has("visible_ids[]")).toBe(false);
  });

  test("refuses to overwrite an existing output before requesting a report", async () => {
    const outputPath = join(testDir, "existing.csv");
    writeFileSync(outputPath, "keep");

    await expect(
      cli(
        ["--company-id", "123", "--download-type", "csv", "--output", outputPath],
        journalExportCommand,
      ),
    ).rejects.toThrow("Output path already exists");
    expect(readFileSync(outputPath, "utf8")).toBe("keep");
    expect(journalRequestCount).toBe(0);
  });

  test("does not create an output when report generation fails", async () => {
    server.use(
      handleGetJournalStatus(({ params }) =>
        HttpResponse.json({
          journals: {
            id: Number(params.id),
            company_id: 123,
            download_type: "generic_v2",
            status: "failed",
          },
        }),
      ),
    );
    const outputPath = join(testDir, "failed.csv");

    await expect(
      cli(
        ["--company-id", "123", "--download-type", "csv", "--output", outputPath],
        journalExportCommand,
      ),
    ).rejects.toThrow("Journal report 91 failed");
    expect(existsSync(outputPath)).toBe(false);
  });
});
