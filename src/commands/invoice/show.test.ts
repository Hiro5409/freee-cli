import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { cli } from "gunshi";
import { HttpResponse } from "msw";
import { setupServer } from "msw/node";

import { MOCK_TOKEN } from "../../../test/credentials.ts";
import { saveCredentials } from "../../config/credentials.ts";
import { handleInvoicesShow } from "../../types/freee-invoice/msw.gen.ts";
import { invoiceShowCommand } from "./show.ts";
import { createMockInvoice, INVOICE_API_BASE_URL } from "./test-fixtures.ts";

const testDir = join(tmpdir(), `freee-cli-invoice-show-test-${Date.now()}`);

const server = setupServer();

beforeAll(() =>
  server.listen({
    onUnhandledRequest(request, print) {
      if (new URL(request.url).hostname === "accounts.secure.freee.co.jp") return;
      print.error();
    },
  }),
);
afterAll(() => server.close());

beforeEach(() => {
  mkdirSync(testDir, { recursive: true });
  saveCredentials(testDir, { default: MOCK_TOKEN });
  process.env.FREEE_CLI_CONFIG_DIR = testDir;
});

afterEach(() => {
  server.resetHandlers();
  delete process.env.FREEE_CLI_CONFIG_DIR;
  rmSync(testDir, { recursive: true, force: true });
});

describe("invoice show command", () => {
  test("現行の請求書APIからID指定で取得し、単一オブジェクトとして出力する", async () => {
    let requestedUrl = "";
    server.use(
      handleInvoicesShow(
        ({ request, params }) => {
          requestedUrl = request.url;
          return HttpResponse.json({
            invoice: createMockInvoice({ id: Number(params.id), subject: "8月分" }),
          });
        },
        { baseUrl: INVOICE_API_BASE_URL },
      ),
    );

    const result = await cli(
      ["--company-id", "123", "--format", "json", "--id", "900"],
      invoiceShowCommand,
    );

    const url = new URL(requestedUrl);
    expect(url.pathname).toBe("/iv/invoices/900");
    expect(url.searchParams.get("company_id")).toBe("123");
    if (typeof result !== "string") throw new Error("expected string result");
    expect(JSON.parse(result)).toMatchObject({ id: 900, subject: "8月分" });
  });
});
