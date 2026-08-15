import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { cli } from "gunshi";
import { HttpResponse } from "msw";
import { setupServer } from "msw/node";

import { MOCK_TOKEN } from "../../../test/credentials.ts";
import { saveCredentials } from "../../config/credentials.ts";
import {
  handleInvoicesCancel,
  handleInvoicesTemplatesIndex,
  handleInvoicesUncancel,
} from "../../types/freee-invoice/msw.gen.ts";
import { invoiceCancelCommand } from "./cancel.ts";
import { invoiceRestoreCommand } from "./restore.ts";
import { invoiceTemplateListCommand } from "./template-list.ts";
import { INVOICE_API_BASE_URL } from "./test-fixtures.ts";

const testDir = join(tmpdir(), `freee-cli-invoice-actions-test-${Date.now()}`);
const server = setupServer(
  handleInvoicesTemplatesIndex(
    { body: { templates: [{ id: 3, name: "Standard" }] } },
    { baseUrl: INVOICE_API_BASE_URL },
  ),
  handleInvoicesCancel(
    ({ params }) =>
      HttpResponse.json({ invoice: { id: Number(params.id), cancel_status: "canceled" } }),
    { baseUrl: INVOICE_API_BASE_URL },
  ),
  handleInvoicesUncancel(
    ({ params }) =>
      HttpResponse.json({ invoice: { id: Number(params.id), cancel_status: "uncanceled" } }),
    { baseUrl: INVOICE_API_BASE_URL },
  ),
);

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterAll(() => server.close());
beforeEach(() => {
  mkdirSync(testDir, { recursive: true });
  saveCredentials(testDir, { default: MOCK_TOKEN });
  process.env.FREEE_CLI_CONFIG_DIR = testDir;
});
afterEach(() => {
  delete process.env.FREEE_CLI_CONFIG_DIR;
  rmSync(testDir, { recursive: true, force: true });
});

describe("invoice actions", () => {
  test("lists invoice templates", async () => {
    const result = await cli(
      ["--company-id", "123", "--format", "json"],
      invoiceTemplateListCommand,
    );
    if (typeof result !== "string") throw new Error("expected string result");
    expect(JSON.parse(result)).toEqual([{ id: 3, name: "Standard" }]);
  });

  test("cancels and restores an invoice", async () => {
    const canceled = await cli(
      ["--company-id", "123", "--id", "900", "--format", "json"],
      invoiceCancelCommand,
    );
    const restored = await cli(
      ["--company-id", "123", "--id", "900", "--format", "json"],
      invoiceRestoreCommand,
    );
    if (typeof canceled !== "string" || typeof restored !== "string") {
      throw new Error("expected string results");
    }
    expect(JSON.parse(canceled)).toEqual({ id: 900, cancel_status: "canceled" });
    expect(JSON.parse(restored)).toEqual({ id: 900, cancel_status: "uncanceled" });
  });

  test("previews cancellation without writing", async () => {
    const result = await cli(
      ["--company-id", "123", "--id", "900", "--dry-run", "--format", "json"],
      invoiceCancelCommand,
    );
    if (typeof result !== "string") throw new Error("expected string result");
    expect(JSON.parse(result).request).toEqual({
      method: "PUT",
      path: "/invoices/900/cancel",
      body: { company_id: 123 },
    });
  });
});
