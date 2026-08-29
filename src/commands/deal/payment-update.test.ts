import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { cli } from "gunshi";
import { HttpResponse } from "msw";
import { setupServer } from "msw/node";

import { MOCK_TOKEN } from "../../../test/credentials.ts";
import { saveCredentials } from "../../config/credentials.ts";
import { handleUpdateDealPayment } from "../../types/freee/msw.gen.ts";
import { dealPaymentUpdateCommand } from "./payment-update.ts";
import { createMockDeal, createMockDealPayment } from "./test-fixtures.ts";

const testDir = join(tmpdir(), `freee-cli-deal-payment-update-test-${Date.now()}`);
const server = setupServer(
  handleUpdateDealPayment(({ params }) =>
    HttpResponse.json({
      deal: createMockDeal({
        id: Number(params.id),
        type: "expense",
        payments: [
          createMockDealPayment({
            id: Number(params.payment_id),
            date: "2026-08-20",
            from_walletable_type: "bank_account",
            from_walletable_id: 9,
            amount: 4000,
          }),
        ],
      }),
    }),
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

describe("deal payment update command", () => {
  test("updates a payment and returns the deal", async () => {
    const result = await cli(
      [
        "--company-id",
        "123",
        "--id",
        "42",
        "--payment-id",
        "7",
        "--date",
        "2026-08-20",
        "--amount",
        "4000",
        "--walletable-type",
        "bank_account",
        "--walletable-id",
        "9",
        "--format",
        "json",
      ],
      dealPaymentUpdateCommand,
    );
    if (typeof result !== "string") throw new Error("expected string result");
    expect(JSON.parse(result).payments[0]).toMatchObject({ id: 7, amount: 4000 });
  });

  test("provides a dry-run request", async () => {
    const result = await cli(
      [
        "--company-id",
        "123",
        "--id",
        "42",
        "--payment-id",
        "7",
        "--date",
        "2026-08-20",
        "--amount",
        "4000",
        "--walletable-type",
        "bank_account",
        "--walletable-id",
        "9",
        "--dry-run",
        "--format",
        "json",
      ],
      dealPaymentUpdateCommand,
    );
    if (typeof result !== "string") throw new Error("expected string result");
    expect(JSON.parse(result).request.method).toBe("PUT");
  });
});
