import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, mock, test } from "bun:test";
import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { cli } from "gunshi";
import { HttpResponse } from "msw";
import { setupServer } from "msw/node";

import { MOCK_TOKEN } from "../../../test/credentials.ts";
import { saveCredentials } from "../../config/credentials.ts";
import { handleInvoicesCreate } from "../../types/freee-invoice/msw.gen.ts";
import { invoiceCreateCommand } from "./create.ts";
import { createMockInvoice, INVOICE_API_BASE_URL } from "./test-fixtures.ts";

const testDir = join(tmpdir(), `freee-cli-invoice-create-test-${Date.now()}`);

const onCreate = mock();

const server = setupServer(
  handleInvoicesCreate(
    async ({ request }) => {
      onCreate(await request.json());
      return HttpResponse.json({ invoice: createMockInvoice({ id: 900 }) }, { status: 201 });
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
  onCreate.mockClear();
  mkdirSync(testDir, { recursive: true });
  saveCredentials(testDir, { default: MOCK_TOKEN });
  process.env.FREEE_CLI_CONFIG_DIR = testDir;
});

afterEach(() => {
  server.resetHandlers();
  delete process.env.FREEE_CLI_CONFIG_DIR;
  rmSync(testDir, { recursive: true, force: true });
});

const baseArgs = [
  "--company-id",
  "123",
  "--partner-id",
  "456",
  "--billing-date",
  "2026-08-01",
  "--line",
  '{"description":"コンサルティング","quantity":1,"unit_price":"100000","tax_rate":10}',
];

describe("invoice create command", () => {
  test("freee が必須とする項目を揃えて送る（既定は外税）", async () => {
    await cli(baseArgs, invoiceCreateCommand);

    expect(onCreate).toHaveBeenCalledTimes(1);
    expect(onCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        company_id: 123,
        partner_id: 456,
        billing_date: "2026-08-01",
        tax_entry_method: "out",
        tax_fraction: "omit",
        withholding_tax_entry_method: "out",
        partner_title: "御中",
        lines: [
          {
            type: "item",
            description: "コンサルティング",
            quantity: 1,
            unit_price: "100000",
            tax_rate: 10,
          },
        ],
      }),
    );
  });

  test("内税を明示できる", async () => {
    await cli([...baseArgs, "--tax-entry-method", "in"], invoiceCreateCommand);

    expect(onCreate).toHaveBeenCalledWith(expect.objectContaining({ tax_entry_method: "in" }));
  });

  test("複数明細をそのまま並べて送る", async () => {
    await cli(
      [
        ...baseArgs,
        "--line",
        '{"description":"交通費","quantity":2,"unit_price":"1500","tax_rate":10}',
        "--line",
        '{"type":"text","description":"— 以下余白 —"}',
      ],
      invoiceCreateCommand,
    );

    const body = onCreate.mock.calls[0]?.[0] as { lines: unknown[] };
    expect(body.lines).toHaveLength(3);
  });

  test("自動採番が無効な事業所向けに invoice_number を渡せる", async () => {
    await cli([...baseArgs, "--invoice-number", "INV-2026-001"], invoiceCreateCommand);

    expect(onCreate).toHaveBeenCalledWith(
      expect.objectContaining({ invoice_number: "INV-2026-001" }),
    );
  });

  test("取引先の指定がなければ API を叩かない", async () => {
    expect(
      cli(
        [
          "--company-id",
          "123",
          "--billing-date",
          "2026-08-01",
          "--line",
          '{"description":"A","quantity":1,"unit_price":"100","tax_rate":10}',
        ],
        invoiceCreateCommand,
      ),
    ).rejects.toThrow(/--partner-id/);
    expect(onCreate).not.toHaveBeenCalled();
  });

  test("取引先IDとコードの同時指定は弾く", async () => {
    expect(cli([...baseArgs, "--partner-code", "P-001"], invoiceCreateCommand)).rejects.toThrow(
      /exactly one/i,
    );
    expect(onCreate).not.toHaveBeenCalled();
  });

  test("暦にない請求日は API を叩く前に弾く", async () => {
    expect(
      cli(
        [
          "--company-id",
          "123",
          "--partner-id",
          "456",
          "--billing-date",
          "2026-02-30",
          "--line",
          '{"description":"A","quantity":1,"unit_price":"100","tax_rate":10}',
        ],
        invoiceCreateCommand,
      ),
    ).rejects.toThrow(/YYYY-MM-DD/);
    expect(onCreate).not.toHaveBeenCalled();
  });

  test("取引先IDが正の整数でなければ弾く", async () => {
    expect(
      cli(
        [
          "--company-id",
          "123",
          "--partner-id",
          "0",
          "--billing-date",
          "2026-08-01",
          "--line",
          '{"description":"A","quantity":1,"unit_price":"100","tax_rate":10}',
        ],
        invoiceCreateCommand,
      ),
    ).rejects.toThrow(/positive integer/);
    expect(onCreate).not.toHaveBeenCalled();
  });
});
