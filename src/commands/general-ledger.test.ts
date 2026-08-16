import { afterAll, afterEach, beforeAll, beforeEach, expect, test } from "bun:test";
import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { cli } from "gunshi";
import { HttpResponse } from "msw";
import { setupServer } from "msw/node";

import { MOCK_TOKEN } from "../../test/credentials.ts";
import { saveCredentials } from "../config/credentials.ts";
import { handleGetGeneralLedgers } from "../types/freee/msw.gen.ts";
import { generalLedgerCommand } from "./general-ledger.ts";

const testDir = join(tmpdir(), `freee-cli-general-ledger-${Date.now()}`);
let requestUrl = "";

const server = setupServer(
  handleGetGeneralLedgers(({ request }) => {
    requestUrl = request.url;
    return HttpResponse.json({
      general_ledgers: [
        { account_item_id: 1, account_item_name: "Cash", total_amount: 1000, final_balance: 1000 },
      ],
    });
  }),
);

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterAll(() => server.close());
beforeEach(() => {
  requestUrl = "";
  mkdirSync(testDir, { recursive: true });
  saveCredentials(testDir, { default: MOCK_TOKEN });
  process.env.FREEE_CLI_CONFIG_DIR = testDir;
});
afterEach(() => {
  server.resetHandlers();
  delete process.env.FREEE_CLI_CONFIG_DIR;
  rmSync(testDir, { recursive: true, force: true });
});

test("general ledger passes date and accounting filters", async () => {
  const result = await cli(
    [
      "--company-id",
      "123",
      "--start-date",
      "2026-08-01",
      "--end-date",
      "2026-08-31",
      "--account-item-name",
      "Cash",
      "--partner-name",
      "ACME",
      "--format",
      "json",
    ],
    generalLedgerCommand,
  );
  const params = new URL(requestUrl).searchParams;
  expect(params.get("start_date")).toBe("2026-08-01");
  expect(params.get("end_date")).toBe("2026-08-31");
  expect(params.get("account_item_name")).toBe("Cash");
  expect(params.get("partner_name")).toBe("ACME");
  expect(JSON.parse(String(result))[0]).toMatchObject({ final_balance: 1000 });
});
