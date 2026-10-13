import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { cli } from "gunshi";
import { setupServer } from "msw/node";

import { MOCK_TOKEN } from "../../../test/credentials.ts";
import { saveCredentials } from "../../config/credentials.ts";
import { handleInvoicesTemplatesIndex } from "../../types/freee-invoice/msw.gen.ts";
import { invoiceTemplateListCommand } from "./template-list.ts";
import { INVOICE_API_BASE_URL } from "./test-fixtures.ts";

const testDir = join(tmpdir(), `freee-cli-invoice-template-list-test-${Date.now()}`);
const server = setupServer(
  handleInvoicesTemplatesIndex(
    { body: { templates: [{ id: 3, name: "Standard" }] } },
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
  server.resetHandlers();
  delete process.env.FREEE_CLI_CONFIG_DIR;
  rmSync(testDir, { recursive: true, force: true });
});

describe("invoice template list command", () => {
  test("lists invoice templates", async () => {
    const result = await cli(
      ["--company-id", "123", "--format", "json"],
      invoiceTemplateListCommand,
    );
    if (typeof result !== "string") throw new Error("expected string result");
    expect(JSON.parse(result)).toEqual([{ id: 3, name: "Standard" }]);
  });
});
