import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, mock, test } from "bun:test";
import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { cli } from "gunshi";
import { HttpResponse } from "msw";
import { setupServer } from "msw/node";

import { MOCK_TOKEN } from "../../../test/credentials.ts";
import { saveCredentials } from "../../config/credentials.ts";
import { handleCreateDealPayment } from "../../types/freee/msw.gen.ts";
import { dealPaymentCreateCommand } from "./payment-create.ts";
import { createMockDeal, createMockDealPayment } from "./test-fixtures.ts";

const testDir = join(tmpdir(), `freee-cli-deal-payment-create-test-${Date.now()}`);
const onCreatePayment = mock();

const server = setupServer(
  handleCreateDealPayment(async ({ params, request }) => {
    const body = await request.json();
    onCreatePayment({ id: params.id, body });
    return HttpResponse.json({
      deal: createMockDeal({
        id: Number(params.id),
        due_amount: 0,
        payments: [createMockDealPayment({ id: 7, ...body })],
      }),
    });
  }),
);

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterAll(() => server.close());

beforeEach(() => {
  onCreatePayment.mockClear();
  mkdirSync(testDir, { recursive: true });
  saveCredentials(testDir, { default: MOCK_TOKEN });
  process.env.FREEE_CLI_CONFIG_DIR = testDir;
});

afterEach(() => {
  server.resetHandlers();
  delete process.env.FREEE_CLI_CONFIG_DIR;
  rmSync(testDir, { recursive: true, force: true });
});

const baseArgs = [
  "--company-id",
  "123",
  "--id",
  "42",
  "--date",
  "2026-08-15",
  "--amount",
  "5000",
  "--walletable-type",
  "bank_account",
  "--walletable-id",
  "9",
];

describe("deal payment create command", () => {
  test("creates a payment for the requested deal", async () => {
    await cli(baseArgs, dealPaymentCreateCommand);

    expect(onCreatePayment).toHaveBeenCalledWith({
      id: "42",
      body: {
        company_id: 123,
        date: "2026-08-15",
        amount: 5000,
        from_walletable_type: "bank_account",
        from_walletable_id: 9,
      },
    });
  });

  test("dry-run returns a structured request without calling the API", async () => {
    const result = await cli(
      [...baseArgs, "--dry-run", "--format", "json"],
      dealPaymentCreateCommand,
    );

    expect(onCreatePayment).not.toHaveBeenCalled();
    if (typeof result !== "string") throw new Error("expected string result");
    expect(JSON.parse(result)).toEqual({
      dryRun: true,
      request: {
        method: "POST",
        path: "/api/1/deals/42/payments",
        body: {
          company_id: 123,
          date: "2026-08-15",
          amount: 5000,
          from_walletable_type: "bank_account",
          from_walletable_id: 9,
        },
      },
    });
  });

  test("rejects invalid payment fields before calling the API", async () => {
    const invalidArgs = [
      baseArgs.map((value) => (value === "2026-08-15" ? "2026-02-30" : value)),
      baseArgs.map((value) => (value === "5000" ? "0" : value)),
      baseArgs.map((value) => (value === "bank_account" ? "paypay" : value)),
      baseArgs.map((value) => (value === "42" ? "0" : value)),
    ];

    for (const args of invalidArgs) {
      await expect(cli([...args, "--dry-run"], dealPaymentCreateCommand)).rejects.toBeInstanceOf(
        Error,
      );
    }
    expect(onCreatePayment).not.toHaveBeenCalled();
  });

  test("--format json returns the updated deal response", async () => {
    const result = await cli([...baseArgs, "--format", "json"], dealPaymentCreateCommand);

    if (typeof result !== "string") throw new Error("expected string result");
    expect(JSON.parse(result).payments[0]).toMatchObject({ id: 7, amount: 5000 });
  });
});
