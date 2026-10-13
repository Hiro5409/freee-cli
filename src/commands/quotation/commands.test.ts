import { afterAll, afterEach, beforeAll, beforeEach, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { cli } from "gunshi";
import { HttpResponse } from "msw";
import { setupServer } from "msw/node";

import { MOCK_TOKEN } from "../../../test/credentials.ts";
import { saveCredentials } from "../../config/credentials.ts";
import {
  handleQuotationsCreate,
  handleQuotationsIndex,
  handleQuotationsShow,
  handleQuotationsTemplatesIndex,
} from "../../types/freee-invoice/msw.gen.ts";
import { quotationCreateCommand } from "./create.ts";
import { quotationListCommand } from "./list.ts";
import { quotationShowCommand } from "./show.ts";
import { quotationTemplateListCommand } from "./template-list.ts";

const baseUrl = "https://api.freee.co.jp/iv";
const server = setupServer();
let testDir: string;

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterAll(() => server.close());
beforeEach(() => {
  testDir = mkdtempSync(join(tmpdir(), "freee-cli-quotation-"));
  saveCredentials(testDir, { default: MOCK_TOKEN });
  process.env.FREEE_CLI_CONFIG_DIR = testDir;
});
afterEach(() => {
  server.resetHandlers();
  delete process.env.FREEE_CLI_CONFIG_DIR;
  rmSync(testDir, { recursive: true, force: true });
});

test("quotation template list uses quotation templates from the selected company", async () => {
  let requestedUrl = "";
  const templates = [{ id: 77, name: "見積" }];
  server.use(
    handleQuotationsTemplatesIndex(
      ({ request }) => {
        requestedUrl = request.url;
        return HttpResponse.json({ templates });
      },
      { baseUrl },
    ),
  );
  const result = await cli(
    ["--company-id", "123", "--format", "json"],
    quotationTemplateListCommand,
  );
  expect(new URL(requestedUrl).pathname).toBe("/iv/quotations/templates");
  expect(new URL(requestedUrl).searchParams.get("company_id")).toBe("123");
  expect(JSON.parse(String(result))).toEqual(templates);
});

test("quotation create sends quotation dates, commercial terms and ordered lines without accounting fields", async () => {
  let body: unknown;
  const quotation = {
    id: 42,
    quotation_number: "EST-42",
    report_url: "https://invoice.secure.freee.co.jp/reports/quotations/42",
  };
  server.use(
    handleQuotationsCreate(
      async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ quotation }, { status: 201 });
      },
      { baseUrl },
    ),
  );
  const result = await cli(
    [
      "--company-id",
      "123",
      "--partner-id",
      "456",
      "--quotation-date",
      "2026-10-01",
      "--expiration-date",
      "2026-10-31",
      "--delivery-deadline",
      "契約後30日",
      "--delivery-location",
      "オンライン",
      "--quotation-number",
      "EST-42",
      "--template-id",
      "77",
      "--subject",
      "開発費",
      "--quotation-note",
      "有効期限内にご確認ください",
      "--line",
      '{"description":"開発","quantity":2,"unit_price":50000,"tax_rate":10}',
      "--line",
      '{"type":"text","description":"納品条件は別紙参照"}',
      "--format",
      "json",
    ],
    quotationCreateCommand,
  );

  expect(body).toEqual({
    company_id: 123,
    partner_id: 456,
    partner_title: "御中",
    quotation_date: "2026-10-01",
    expiration_date: "2026-10-31",
    delivery_deadline: "契約後30日",
    delivery_location: "オンライン",
    quotation_number: "EST-42",
    template_id: 77,
    subject: "開発費",
    quotation_note: "有効期限内にご確認ください",
    tax_entry_method: "out",
    tax_fraction: "omit",
    withholding_tax_entry_method: "out",
    lines: [
      { type: "item", description: "開発", quantity: 2, unit_price: "50000", tax_rate: 10 },
      { type: "text", description: "納品条件は別紙参照" },
    ],
  });
  expect(JSON.parse(String(result))).toEqual(quotation);
});

test("quotation create rejects unsupported or incomplete lines before sending a request", async () => {
  let writes = 0;
  server.use(
    handleQuotationsCreate(
      () => {
        writes += 1;
        return HttpResponse.json({ quotation: { id: 42 } }, { status: 201 });
      },
      { baseUrl },
    ),
  );
  const baseArgs = ["--company-id", "123", "--partner-id", "456", "--quotation-date", "2026-10-01"];
  const invalidLines = [
    '{"quantity":1,"unit_price":"100","tax_rate":10,"reduced_tax_rate":true}',
    '{"quantity":100000000,"tax_rate":10}',
    '{"quantity":1.0001,"tax_rate":10}',
    '{"quantity":1,"unit_price":"100.0001","tax_rate":10}',
    '{"quantity":1,"unit_price":"invalid","tax_rate":10}',
    '{"quantity":1,"tax_rate":10,"account_item_id":123}',
    '{"type":"text","description":"備考","quantity":1}',
    '{"description":"開発費","tax_rate":10}',
    '{"quantity":1,"tax_rate":5}',
    "not json",
  ];
  for (const line of invalidLines) {
    await expect(cli([...baseArgs, "--line", line], quotationCreateCommand)).rejects.toThrow(
      /--line #1/,
    );
  }
  expect(writes).toBe(0);
});

test("quotation create requires one nonempty partner identifier and valid dates before writing", async () => {
  let writes = 0;
  server.use(
    handleQuotationsCreate(
      () => {
        writes += 1;
        return HttpResponse.json({ quotation: { id: 42 } }, { status: 201 });
      },
      { baseUrl },
    ),
  );
  const baseArgs = [
    "--company-id",
    "123",
    "--quotation-date",
    "2026-10-01",
    "--line",
    '{"quantity":1,"unit_price":"100","tax_rate":10}',
  ];
  for (const flags of [
    [],
    ["--partner-id", "456", "--partner-code", "P-001"],
    ["--partner-code", ""],
  ]) {
    await expect(cli([...baseArgs, ...flags], quotationCreateCommand)).rejects.toThrow(/partner/);
  }
  await expect(
    cli(
      [...baseArgs, "--partner-id", "456", "--expiration-date", "2026-02-30"],
      quotationCreateCommand,
      {
        renderValidationErrors: null,
      },
    ),
  ).rejects.toThrow();
  await expect(
    cli(
      [
        "--company-id",
        "123",
        "--partner-id",
        "456",
        "--quotation-date",
        "2026/10/01",
        "--line",
        '{"quantity":1,"tax_rate":10}',
      ],
      quotationCreateCommand,
      { renderValidationErrors: null },
    ),
  ).rejects.toThrow();
  await expect(
    cli(
      ["--company-id", "123", "--partner-id", "456", "--quotation-date", "2026-10-01"],
      quotationCreateCommand,
      { renderValidationErrors: null },
    ),
  ).rejects.toThrow();
  expect(writes).toBe(0);
});

test("quotation create accepts a partner code and reduced-tax decimal lines with explicit rounding", async () => {
  let body: unknown;
  server.use(
    handleQuotationsCreate(
      async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ quotation: { id: 42 } }, { status: 201 });
      },
      { baseUrl },
    ),
  );
  await cli(
    [
      "--company-id",
      "123",
      "--partner-code",
      "P-001",
      "--partner-title",
      "様",
      "--quotation-date",
      "2026-10-01",
      "--tax-entry-method",
      "in",
      "--tax-fraction",
      "round_up",
      "--line-amount-fraction",
      "round",
      "--withholding-tax-entry-method",
      "in",
      "--line",
      '{"quantity":-1.125,"unit_price":"9999999999999.999","tax_rate":8,"reduced_tax_rate":true,"withholding":true}',
      "--format",
      "json",
    ],
    quotationCreateCommand,
  );
  expect(body).toEqual({
    company_id: 123,
    partner_code: "P-001",
    partner_title: "様",
    quotation_date: "2026-10-01",
    tax_entry_method: "in",
    tax_fraction: "round_up",
    line_amount_fraction: "round",
    withholding_tax_entry_method: "in",
    lines: [
      {
        type: "item",
        quantity: -1.125,
        unit_price: "9999999999999.999",
        tax_rate: 8,
        reduced_tax_rate: true,
        withholding: true,
      },
    ],
  });
});

test("quotation show keeps nullable legacy lines and returns the report URL", async () => {
  const quotation = {
    id: 42,
    quotation_number: "EST-42",
    quotation_date: "2026-10-01",
    expiration_date: null,
    lines: [
      { type: "item", description: "開発費", quantity: null, unit_price: null, tax_rate: 10 },
    ],
    report_url: "https://invoice.secure.freee.co.jp/reports/quotations/42",
  };
  let requestedUrl = "";
  server.use(
    handleQuotationsShow(
      ({ request }) => {
        requestedUrl = request.url;
        return HttpResponse.json({ quotation });
      },
      { baseUrl },
    ),
  );
  const result = await cli(
    ["--company-id", "123", "--id", "42", "--format", "json"],
    quotationShowCommand,
  );
  expect(new URL(requestedUrl).pathname).toBe("/iv/quotations/42");
  expect(new URL(requestedUrl).searchParams.get("company_id")).toBe("123");
  expect(JSON.parse(String(result))).toEqual(quotation);
});
test("quotation list filters by quotation month and returns records from the invoice API", async () => {
  let requestedUrl = "";
  server.use(
    handleQuotationsIndex(
      ({ request }) => {
        requestedUrl = request.url;
        return HttpResponse.json({ quotations: [{ id: 42, quotation_number: "EST-42" }] });
      },
      { baseUrl },
    ),
  );

  const result = await cli(
    ["--company-id", "123", "--month", "2026-02", "--sending-status", "unsent", "--format", "json"],
    quotationListCommand,
  );

  const url = new URL(requestedUrl);
  expect(url.origin + url.pathname).toBe("https://api.freee.co.jp/iv/quotations");
  expect(url.searchParams.get("company_id")).toBe("123");
  expect(url.searchParams.get("start_quotation_date")).toBe("2026-02-01");
  expect(url.searchParams.get("end_quotation_date")).toBe("2026-02-28");
  expect(url.searchParams.get("sending_status")).toBe("unsent");
  expect(JSON.parse(String(result))).toEqual([{ id: 42, quotation_number: "EST-42" }]);
});
