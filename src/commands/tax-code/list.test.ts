import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { cli } from "gunshi";
import { HttpResponse } from "msw";
import { setupServer } from "msw/node";

import { MOCK_TOKEN } from "../../../test/credentials.ts";
import { saveCredentials } from "../../config/credentials.ts";
import { handleGetTaxesCompanies } from "../../types/freee/msw.gen.ts";
import { taxCodeListCommand } from "./list.ts";

const testDir = join(tmpdir(), `freee-cli-tax-code-list-test-${Date.now()}`);
let requestedUrl = "";
const server = setupServer(
  handleGetTaxesCompanies(({ request }) => {
    requestedUrl = request.url;
    return HttpResponse.json({
      taxes: [
        {
          code: 21,
          name: "taxable_purchase_10",
          name_ja: "課対仕入10%",
          display_category: "tax_10",
          available: true,
        },
      ],
    });
  }),
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
  requestedUrl = "";
  delete process.env.FREEE_CLI_CONFIG_DIR;
  rmSync(testDir, { recursive: true, force: true });
});

describe("tax code list command", () => {
  test("uses the company-scoped current endpoint and returns available tax codes", async () => {
    const result = await cli(["--company-id", "123", "--format", "json"], taxCodeListCommand);

    const url = new URL(requestedUrl);
    expect(url.pathname).toBe("/api/1/taxes/companies/123");
    expect(url.searchParams.get("available")).toBe("true");
    if (typeof result !== "string") throw new Error("expected string result");
    expect(JSON.parse(result)).toEqual([
      expect.objectContaining({ code: 21, display_category: "tax_10", available: true }),
    ]);
  });
});
