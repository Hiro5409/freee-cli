import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { cli } from "gunshi";
import { HttpResponse } from "msw";
import { setupServer } from "msw/node";

import { MOCK_TOKEN } from "../../../test/credentials.ts";
import { saveCredentials } from "../../config/credentials.ts";
import { handleInvoicesIndex } from "../../types/freee-invoice/msw.gen.ts";
import { invoiceListCommand } from "./list.ts";
import { createMockInvoiceSummary, INVOICE_API_BASE_URL } from "./test-fixtures.ts";

const testDir = join(tmpdir(), `freee-cli-invoice-list-test-${Date.now()}`);

const server = setupServer(
  handleInvoicesIndex(
    {
      body: {
        invoices: [
          createMockInvoiceSummary({ id: 1, subject: "8月分", sending_status: "unsent" }),
          createMockInvoiceSummary({ id: 2, subject: "9月分", deal_status: "unregistered" }),
        ],
      },
    },
    { baseUrl: INVOICE_API_BASE_URL },
  ),
);

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

describe("invoice list command", () => {
  test("現行の請求書API (/iv/invoices) から一覧を取得する", async () => {
    let requestedUrl = "";
    server.use(
      handleInvoicesIndex(
        ({ request }) => {
          requestedUrl = request.url;
          return HttpResponse.json({ invoices: [createMockInvoiceSummary({ id: 7 })] });
        },
        { baseUrl: INVOICE_API_BASE_URL },
      ),
    );

    const result = await cli(["--company-id", "123", "--format", "json"], invoiceListCommand);

    expect(requestedUrl).toStartWith("https://api.freee.co.jp/iv/invoices");
    expect(new URL(requestedUrl).searchParams.get("company_id")).toBe("123");

    if (typeof result !== "string") throw new Error("expected string result");
    expect(JSON.parse(result)).toHaveLength(1);
  });

  test("未送付・取引未登録のフィルタをクエリに渡す", async () => {
    let requestedUrl = "";
    server.use(
      handleInvoicesIndex(
        ({ request }) => {
          requestedUrl = request.url;
          return HttpResponse.json({ invoices: [] });
        },
        { baseUrl: INVOICE_API_BASE_URL },
      ),
    );

    await cli(
      [
        "--company-id",
        "123",
        "--format",
        "json",
        "--sending-status",
        "unsent",
        "--deal-status",
        "unregistered",
      ],
      invoiceListCommand,
    );

    const params = new URL(requestedUrl).searchParams;
    expect(params.get("sending_status")).toBe("unsent");
    expect(params.get("deal_status")).toBe("unregistered");
  });

  test("--month は請求日の範囲に変換する", async () => {
    let requestedUrl = "";
    server.use(
      handleInvoicesIndex(
        ({ request }) => {
          requestedUrl = request.url;
          return HttpResponse.json({ invoices: [] });
        },
        { baseUrl: INVOICE_API_BASE_URL },
      ),
    );

    await cli(
      ["--company-id", "123", "--format", "json", "--month", "2026-02"],
      invoiceListCommand,
    );

    const params = new URL(requestedUrl).searchParams;
    expect(params.get("start_billing_date")).toBe("2026-02-01");
    expect(params.get("end_billing_date")).toBe("2026-02-28");
  });

  test("--partner-ids は3件以内の正の整数だけを受け付ける", async () => {
    for (const value of ["1,2,3,4", "1,abc", "0,2"]) {
      await expect(
        cli(["--company-id", "123", "--partner-ids", value], invoiceListCommand),
      ).rejects.toBeInstanceOf(Error);
    }
  });

  test("freee が受け付けないステータスは API を叩く前に弾く", async () => {
    expect(
      cli(["--company-id", "123", "--sending-status", "draft"], invoiceListCommand),
    ).rejects.toThrow();
  });
});
