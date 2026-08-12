import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, mock, test } from "bun:test";
import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { cli } from "gunshi";
import { HttpResponse } from "msw";
import { setupServer } from "msw/node";

import { invoiceUpdateCommand } from "../../src/commands/invoice/update.ts";
import { saveCredentials } from "../../src/config/credentials.ts";
import { handleInvoicesShow, handleInvoicesUpdate } from "../../src/types/freee-invoice/msw.gen.ts";
import type { InvoiceShowResponseInvoice } from "../../src/types/freee-invoice/types.gen.ts";
import { createMockInvoice, INVOICE_API_BASE_URL, MOCK_TOKEN } from "../fixtures.ts";

const testDir = join(tmpdir(), `freee-cli-invoice-update-test-${Date.now()}`);

const onUpdate = mock();

function stub(invoice: Partial<InvoiceShowResponseInvoice>) {
  server.use(
    handleInvoicesShow(
      { body: { invoice: createMockInvoice({ id: 900, ...invoice }) } },
      { baseUrl: INVOICE_API_BASE_URL },
    ),
  );
}

const server = setupServer(
  handleInvoicesShow(
    { body: { invoice: createMockInvoice({ id: 900 }) } },
    { baseUrl: INVOICE_API_BASE_URL },
  ),
  handleInvoicesUpdate(
    async ({ request }) => {
      onUpdate(await request.json());
      return HttpResponse.json({ invoice: createMockInvoice({ id: 900 }) });
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
  onUpdate.mockClear();
  mkdirSync(testDir, { recursive: true });
  saveCredentials(testDir, { default: MOCK_TOKEN });
  process.env.FREEE_CLI_CONFIG_DIR = testDir;
});

afterEach(() => {
  server.resetHandlers();
  delete process.env.FREEE_CLI_CONFIG_DIR;
  rmSync(testDir, { recursive: true, force: true });
});

const baseArgs = ["--company-id", "123", "--id", "900"];

describe("invoice update command", () => {
  test("件名だけ変えても他の項目は現状のまま送り直す (PUT は全置換)", async () => {
    await cli([...baseArgs, "--subject", "9月分"], invoiceUpdateCommand);

    expect(onUpdate).toHaveBeenCalledTimes(1);
    expect(onUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        company_id: 123,
        subject: "9月分",
        billing_date: "2026-08-01",
        partner_id: 456,
        partner_title: "御中",
        tax_entry_method: "out",
        tax_fraction: "omit",
        withholding_tax_entry_method: "out",
        invoice_number: "INV-900",
        lines: [
          {
            type: "item",
            description: "コンサルティング",
            quantity: 1,
            unit_price: "100000",
            tax_rate: 10,
            withholding: false,
          },
        ],
      }),
    );
  });

  test("読み取り専用のフィールドは送り返さない", async () => {
    await cli([...baseArgs, "--subject", "9月分"], invoiceUpdateCommand);

    const body = onUpdate.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(body).not.toHaveProperty("id");
    expect(body).not.toHaveProperty("total_amount");
    expect(body).not.toHaveProperty("sending_status");
    expect(body).not.toHaveProperty("deal_status");
    expect(body).not.toHaveProperty("created_at");
    expect(body).not.toHaveProperty("report_url");
    expect(body).not.toHaveProperty("partner_code");
    expect((body.lines as Array<Record<string, unknown>>)[0]).not.toHaveProperty("id");
  });

  test("--line を渡したときだけ明細を差し替える", async () => {
    await cli(
      [
        ...baseArgs,
        "--line",
        '{"description":"保守費","quantity":12,"unit_price":"5000","tax_rate":10}',
      ],
      invoiceUpdateCommand,
    );

    const body = onUpdate.mock.calls[0]?.[0] as { lines: Array<{ description: string }> };
    expect(body.lines).toHaveLength(1);
    expect(body.lines[0]?.description).toBe("保守費");
  });

  test("繰越金額があれば include フラグ付きで保つ", async () => {
    stub({ amount_brought_forward: 33000 });

    await cli([...baseArgs, "--subject", "9月分"], invoiceUpdateCommand);

    expect(onUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        include_amount_brought_forward: true,
        amount_brought_forward: 33000,
      }),
    );
  });

  test("繰越金額がなければ include フラグを立てない", async () => {
    stub({ amount_brought_forward: 0 });

    await cli([...baseArgs, "--subject", "9月分"], invoiceUpdateCommand);

    const body = onUpdate.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(body.include_amount_brought_forward).toBeUndefined();
    expect(body.amount_brought_forward).toBeUndefined();
  });

  test("税区分が取得できず指定もなければ、黙って上書きせずエラーにする", async () => {
    stub({ tax_entry_method: undefined });

    expect(cli([...baseArgs, "--subject", "9月分"], invoiceUpdateCommand)).rejects.toThrow(
      /--tax-entry-method/,
    );
    expect(onUpdate).not.toHaveBeenCalled();
  });

  test("取得できない税区分もフラグで補える", async () => {
    stub({ tax_entry_method: undefined });

    await cli([...baseArgs, "--tax-entry-method", "in"], invoiceUpdateCommand);

    expect(onUpdate).toHaveBeenCalledWith(expect.objectContaining({ tax_entry_method: "in" }));
  });

  test("--dry-run は PUT しない", async () => {
    const result = await cli(
      [...baseArgs, "--subject", "9月分", "--dry-run"],
      invoiceUpdateCommand,
    );

    expect(onUpdate).not.toHaveBeenCalled();
    if (typeof result !== "string") throw new Error("expected string result");
    expect(result).toContain("Dry run");
  });

  test("請求書IDが正の整数でなければ取得しにいかない", async () => {
    expect(cli(["--company-id", "123", "--id", "abc"], invoiceUpdateCommand)).rejects.toThrow(
      /positive integer/,
    );
    expect(onUpdate).not.toHaveBeenCalled();
  });
});
