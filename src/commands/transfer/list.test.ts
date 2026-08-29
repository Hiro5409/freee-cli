import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { cli } from "gunshi";
import { HttpResponse } from "msw";
import { setupServer } from "msw/node";

import { MOCK_TOKEN } from "../../../test/credentials.ts";
import { saveCredentials } from "../../config/credentials.ts";
import { handleGetTransfers } from "../../types/freee/msw.gen.ts";
import { transferListCommand } from "./list.ts";

const testDir = join(tmpdir(), `freee-cli-transfer-list-test-${Date.now()}`);
let listUrl = "";
const transfer = {
  id: 42,
  company_id: 123,
  amount: 5000,
  date: "2026-08-01",
  from_walletable_type: "bank_account" as const,
  from_walletable_id: 10,
  to_walletable_type: "credit_card" as const,
  to_walletable_id: 20,
  description: "card payment",
  to_walletables: [
    { type: "credit_card" as const, id: 20, amount: 5000, description: "card payment" },
  ],
};
const server = setupServer(
  handleGetTransfers(({ request }) => {
    listUrl = request.url;
    return HttpResponse.json({ transfers: [transfer] });
  }),
);

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterAll(() => server.close());
beforeEach(() => {
  listUrl = "";
  mkdirSync(testDir, { recursive: true });
  saveCredentials(testDir, { default: MOCK_TOKEN });
  process.env.FREEE_CLI_CONFIG_DIR = testDir;
});
afterEach(() => {
  server.resetHandlers();
  delete process.env.FREEE_CLI_CONFIG_DIR;
  rmSync(testDir, { recursive: true, force: true });
});

describe("transfer list command", () => {
  test("lists transfers for a month", async () => {
    const result = await cli(
      ["--company-id", "123", "--month", "2026-08", "--format", "json"],
      transferListCommand,
    );
    const params = new URL(listUrl).searchParams;
    expect(params.get("start_date")).toBe("2026-08-01");
    expect(params.get("end_date")).toBe("2026-08-31");
    expect(JSON.parse(String(result))).toHaveLength(1);
  });
});
