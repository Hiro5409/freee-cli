import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { cli } from "gunshi";
import { HttpResponse } from "msw";
import { setupServer } from "msw/node";

import { MOCK_TOKEN } from "../../../test/credentials.ts";
import { saveCredentials } from "../../config/credentials.ts";
import { handleGetReceipts } from "../../types/freee/msw.gen.ts";
import { fileBoxListCommand } from "./list.ts";

const testDir = join(tmpdir(), `freee-cli-file-box-list-test-${Date.now()}`);
let requestUrl = "";

const server = setupServer(
  handleGetReceipts(({ request }) => {
    requestUrl = request.url;
    return HttpResponse.json({ receipts: [] });
  }),
);

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterAll(() => server.close());
beforeEach(() => {
  mkdirSync(testDir, { recursive: true });
  saveCredentials(testDir, { default: MOCK_TOKEN });
  process.env.FREEE_CLI_CONFIG_DIR = testDir;
  requestUrl = "";
});
afterEach(() => {
  server.resetHandlers();
  delete process.env.FREEE_CLI_CONFIG_DIR;
  rmSync(testDir, { recursive: true, force: true });
});

describe("File Box list command", () => {
  test("passes the required upload date range through to freee", async () => {
    const result = await cli(
      [
        "--company-id",
        "123",
        "--start-date",
        "2026-07-15",
        "--end-date",
        "2026-08-14",
        "--format",
        "json",
      ],
      fileBoxListCommand,
    );

    const url = new URL(requestUrl);
    expect(url.searchParams.get("start_date")).toBe("2026-07-15");
    expect(url.searchParams.get("end_date")).toBe("2026-08-14");
    expect(JSON.parse(String(result))).toEqual([]);
  });

  test.each([
    ["all", "all"],
    ["without-deal", "without_deal"],
    ["expense-application", "with_expense_application_line"],
    ["with-deal", "with_deal"],
    ["ignored", "ignored"],
  ] as const)("maps category %s to %s", async (category, expectedCode) => {
    await cli(
      [
        "--company-id",
        "123",
        "--start-date",
        "2026-08-01",
        "--end-date",
        "2026-08-31",
        "--category",
        category,
        "--format",
        "json",
      ],
      fileBoxListCommand,
    );

    expect(new URL(requestUrl).searchParams.get("category")).toBe(expectedCode);
  });
});
