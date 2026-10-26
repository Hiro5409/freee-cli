import { afterAll, afterEach, beforeAll, beforeEach, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { cli } from "gunshi";
import { http, HttpResponse } from "msw/http";

import { invoiceListCommand } from "../src/commands/invoice/list.ts";
import { quotationListCommand } from "../src/commands/quotation/list.ts";
import { saveCredentials } from "../src/config/credentials.ts";
import { MOCK_TOKEN } from "./credentials.ts";
import { createNetwork } from "./network.ts";

const network = createNetwork();
let testDir: string;
let previousConfigDir: string | undefined;
beforeAll(() => network.enable());
afterAll(() => network.disable());
beforeEach(() => {
  testDir = mkdtempSync(join(tmpdir(), "freee-invoice-pagination-"));
  saveCredentials(testDir, { default: MOCK_TOKEN });
  previousConfigDir = process.env.FREEE_CLI_CONFIG_DIR;
  process.env.FREEE_CLI_CONFIG_DIR = testDir;
});
afterEach(() => {
  network.resetHandlers();
  if (previousConfigDir === undefined) delete process.env.FREEE_CLI_CONFIG_DIR;
  else process.env.FREEE_CLI_CONFIG_DIR = previousConfigDir;
  rmSync(testDir, { recursive: true, force: true });
});

test.each([
  ["invoices", invoiceListCommand],
  ["quotations", quotationListCommand],
] as const)(
  "%s listing explains the API window without making an invalid request",
  async (resource, command) => {
    let invalidRequests = 0;
    network.use(
      http.get(`https://api.freee.co.jp/iv/${resource}`, ({ request }) => {
        const query = new URL(request.url).searchParams;
        const offset = Number(query.get("offset"));
        const limit = Number(query.get("limit"));
        if (offset + limit > 10_000) {
          invalidRequests++;
          return HttpResponse.json({ message: "API window exceeded" }, { status: 400 });
        }
        return HttpResponse.json({
          [resource]: Array.from({ length: limit }, (_, i) => ({ id: offset + i + 1 })),
        });
      }),
    );
    await expect(cli(["--company-id", "123", "--format", "json"], command)).rejects.toMatchObject({
      code: "INVALID_INPUT",
      hint: expect.stringContaining("--month"),
      message: expect.stringContaining("10,000"),
    });
    const bounded = await cli(
      ["--company-id", "123", "--format", "json", "--limit", "10000"],
      command,
    );
    const records = JSON.parse(String(bounded));
    expect(records).toHaveLength(10_000);
    expect(records.at(-1)).toEqual({ id: 10_000 });
    expect(invalidRequests).toBe(0);
  },
);
