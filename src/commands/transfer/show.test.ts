import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { cli } from "gunshi";
import { HttpResponse } from "msw";
import { setupServer } from "msw/node";

import { MOCK_TOKEN } from "../../../test/credentials.ts";
import { saveCredentials } from "../../config/credentials.ts";
import { handleGetTransfer } from "../../types/freee/msw.gen.ts";
import { transferShowCommand } from "./show.ts";

const testDir = join(tmpdir(), `freee-cli-transfer-show-test-${Date.now()}`);
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
const server = setupServer(handleGetTransfer(() => HttpResponse.json({ transfer })));

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

describe("transfer show command", () => {
  test("shows one transfer", async () => {
    const result = await cli(
      ["--company-id", "123", "--id", "42", "--format", "json"],
      transferShowCommand,
    );
    expect(JSON.parse(String(result))).toMatchObject({ id: 42 });
  });
});
