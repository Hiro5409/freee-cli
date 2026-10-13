import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { cli } from "gunshi";
import { HttpResponse } from "msw";
import { setupServer } from "msw/node";

import { MOCK_TOKEN } from "../../../test/credentials.ts";
import { saveCredentials } from "../../config/credentials.ts";
import { handleGetDeal } from "../../types/freee/msw.gen.ts";
import { createMockDeal } from "./test-fixtures.ts";
import { dealUpdateCommand } from "./update.ts";

const testDir = join(tmpdir(), `freee-cli-deal-update-test-${Date.now()}`);
const currentDeal = createMockDeal({
  id: 42,
  issue_date: "2026-08-01",
  type: "expense",
  partner_id: 55,
  partner_code: "PARTNER-55",
  ref_number: "REF-42",
  details: [
    {
      id: 10,
      account_item_id: 101,
      tax_code: 21,
      amount: 10_000,
      vat: 909,
      entry_side: "debit",
      description: "first",
      tag_ids: [7],
    },
    {
      id: 11,
      account_item_id: 102,
      tax_code: 2,
      amount: 2_000,
      vat: 0,
      entry_side: "debit",
      description: "second",
    },
  ],
  receipts: [],
});

const server = setupServer(handleGetDeal(() => HttpResponse.json({ deal: currentDeal })));

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

describe("deal update command", () => {
  test("replaces details only when exact --detail objects are supplied", async () => {
    const result = await cli(
      [
        "--company-id",
        "123",
        "--id",
        "42",
        "--detail",
        '{"id":10,"account_item_id":201,"tax_code":21,"amount":10000,"description":"updated"}',
        "--detail",
        '{"id":11,"account_item_id":102,"tax_code":2,"amount":2000,"description":"second"}',
        "--dry-run",
        "--format",
        "json",
      ],
      dealUpdateCommand,
    );

    const body = JSON.parse(String(result)).request.body;
    expect(body.details).toEqual([
      {
        id: 10,
        account_item_id: 201,
        tax_code: 21,
        amount: 10_000,
        description: "updated",
      },
      {
        id: 11,
        account_item_id: 102,
        tax_code: 2,
        amount: 2_000,
        description: "second",
      },
    ]);
  });

  test("preserves every current detail when --detail is omitted", async () => {
    const result = await cli(
      [
        "--company-id",
        "123",
        "--id",
        "42",
        "--receipt-ids",
        "80,81",
        "--dry-run",
        "--format",
        "json",
      ],
      dealUpdateCommand,
    );

    const body = JSON.parse(String(result)).request.body;
    expect(body.details).toEqual([
      {
        id: 10,
        account_item_id: 101,
        tax_code: 21,
        amount: 10_000,
        tag_ids: [7],
        description: "first",
        vat: 909,
      },
      {
        id: 11,
        account_item_id: 102,
        tax_code: 2,
        amount: 2_000,
        description: "second",
        vat: 0,
      },
    ]);
    expect(body.receipt_ids).toEqual([80, 81]);
    expect(body.partner_id).toBe(55);
    expect(body).not.toHaveProperty("partner_code");
  });

  test("rejects a malformed --detail before constructing the replacement", async () => {
    await expect(
      cli(
        ["--company-id", "123", "--id", "42", "--detail", '{"amount":1000}', "--dry-run"],
        dealUpdateCommand,
      ),
    ).rejects.toThrow("--detail #1 is invalid");
  });
});
