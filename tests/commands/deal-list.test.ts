import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { cli } from "gunshi";
import { setupServer } from "msw/node";

import { dealListCommand } from "../../src/commands/deal/list.ts";
import { saveCredentials } from "../../src/config/credentials.ts";
import { handleGetDeals } from "../../src/types/freee/msw.gen.ts";
import { createMockDeal, MOCK_TOKEN } from "../fixtures.ts";

const testDir = join(tmpdir(), `freee-cli-deal-list-test-${Date.now()}`);

const server = setupServer(
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
    server.use(
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
});
