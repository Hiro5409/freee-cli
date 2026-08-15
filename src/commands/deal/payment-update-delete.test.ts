import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { cli } from "gunshi";
import { HttpResponse } from "msw";
import { setupServer } from "msw/node";

import { MOCK_TOKEN } from "../../../test/credentials.ts";
import { saveCredentials } from "../../config/credentials.ts";
import { handleDestroyDealPayment, handleUpdateDealPayment } from "../../types/freee/msw.gen.ts";
import { dealPaymentDeleteCommand } from "./payment-delete.ts";
import { dealPaymentUpdateCommand } from "./payment-update.ts";
import { createMockDeal } from "./test-fixtures.ts";

const testDir = join(tmpdir(), `freee-cli-deal-payment-mutation-test-${Date.now()}`);
const server = setupServer(
  handleUpdateDealPayment(({ params }) =>
    HttpResponse.json({
      deal: createMockDeal({
        id: Number(params.id),
        type: "expense",
        payments: [
          {
            id: Number(params.payment_id),
            date: "2026-08-20",
            from_walletable_type: "bank_account",
            from_walletable_id: 9,
            amount: 4000,
          },
        ],
      }),
    }),
  ),
  handleDestroyDealPayment(() => new HttpResponse(null, { status: 204 })),
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

describe("deal payment mutations", () => {
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

  test("deletes a payment", async () => {
    const result = await cli(
      ["--company-id", "123", "--id", "42", "--payment-id", "7", "--format", "json"],
      dealPaymentDeleteCommand,
    );
    if (typeof result !== "string") throw new Error("expected string result");
    expect(JSON.parse(result)).toEqual({ dealId: 42, paymentId: 7, deleted: true });
  });

  test("both mutations provide a dry-run request", async () => {
    const update = await cli(
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
    const remove = await cli(
      ["--company-id", "123", "--id", "42", "--payment-id", "7", "--dry-run", "--format", "json"],
      dealPaymentDeleteCommand,
    );
    if (typeof update !== "string" || typeof remove !== "string") {
      throw new Error("expected string results");
    }
    expect(JSON.parse(update).request.method).toBe("PUT");
    expect(JSON.parse(remove).request.method).toBe("DELETE");
  });
});
