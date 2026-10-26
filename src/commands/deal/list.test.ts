import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { cli } from "gunshi";

import { MOCK_TOKEN } from "../../../test/credentials.ts";
import { createNetwork } from "../../../test/network.ts";
import { saveCredentials } from "../../config/credentials.ts";
import { handleGetDeals } from "../../types/freee/msw.gen.ts";
import { dealListCommand } from "./list.ts";
import { createMockDeal } from "./test-fixtures.ts";

const testDir = join(tmpdir(), `freee-cli-deal-list-test-${Date.now()}`);

const network = createNetwork(
  handleGetDeals({
    body: {
      deals: [
        createMockDeal({ id: 1, type: "income", amount: 50000, partner_id: 10, status: "settled" }),
        createMockDeal({ id: 2, type: "expense", amount: 3000, status: "unsettled" }),
      ],
      meta: { total_count: 2 },
    },
  }),
);

beforeAll(() => network.enable());
afterAll(() => network.disable());

beforeEach(() => {
  mkdirSync(testDir, { recursive: true });
  saveCredentials(testDir, { default: MOCK_TOKEN });
  process.env.FREEE_CLI_CONFIG_DIR = testDir;
});

afterEach(() => {
  network.resetHandlers();
  delete process.env.FREEE_CLI_CONFIG_DIR;
  rmSync(testDir, { recursive: true, force: true });
});

describe("deal list command", () => {
  test("outputs deals as JSON", async () => {
    const result = await cli(["--company-id", "123", "--format", "json"], dealListCommand);

    if (typeof result !== "string") throw new Error("expected string result");
    const output = JSON.parse(result);
    expect(output).toHaveLength(2);
    expect(output[0].id).toBe(1);
    expect(output[0].amount).toBe(50000);
    expect(output[1].type).toBe("expense");
  });

  test("passes month filter as query params", async () => {
    network.use(
      handleGetDeals(async ({ request }) => {
        const url = new URL(request.url);
        expect(url.searchParams.get("start_issue_date")).toBe("2026-03-01");
        expect(url.searchParams.get("end_issue_date")).toBe("2026-03-31");
        return new Response(JSON.stringify({ deals: [], meta: { total_count: 0 } }), {
          headers: { "Content-Type": "application/json" },
        });
      }),
    );

    const result = await cli(
      ["--company-id", "123", "--format", "json", "--month", "2026-03"],
      dealListCommand,
    );
    if (typeof result !== "string") throw new Error("expected string result");
    expect(JSON.parse(result)).toEqual([]);
  });

  test("passes accounting filters through to freee", async () => {
    network.use(
      handleGetDeals(async ({ request }) => {
        const params = new URL(request.url).searchParams;
        expect(params.get("type")).toBe("expense");
        expect(params.get("status")).toBe("unsettled");
        expect(params.get("account_item_id")).toBe("123");
        expect(params.get("partner_id")).toBe("456");
        expect(params.get("accruals")).toBe("with");
        return Response.json({ deals: [], meta: { total_count: 0 } });
      }),
    );

    const result = await cli(
      [
        "--company-id",
        "123",
        "--format",
        "json",
        "--type",
        "expense",
        "--status",
        "unsettled",
        "--account-item-id",
        "123",
        "--partner-id",
        "456",
        "--accruals",
        "with",
      ],
      dealListCommand,
    );
    expect(JSON.parse(String(result))).toEqual([]);
  });

  test("limits both the API request and JSON result", async () => {
    network.use(
      handleGetDeals(async ({ request }) => {
        expect(new URL(request.url).searchParams.get("limit")).toBe("1");
        return new Response(
          JSON.stringify({
            deals: [createMockDeal({ id: 1 })],
            meta: { total_count: 2 },
          }),
          { headers: { "Content-Type": "application/json" } },
        );
      }),
    );

    const result = await cli(
      ["--company-id", "123", "--format", "json", "--limit", "1"],
      dealListCommand,
    );
    if (typeof result !== "string") throw new Error("expected string result");
    expect(JSON.parse(result)).toHaveLength(1);
  });
});
