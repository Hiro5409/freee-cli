import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, mock, test } from "bun:test";
import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { cli } from "gunshi";
import { HttpResponse } from "msw";
import { setupServer } from "msw/node";

import { MOCK_TOKEN } from "../../../test/credentials.ts";
import { saveCredentials } from "../../config/credentials.ts";
import {
  handleCreateTransfer,
  handleGetTransfer,
  handleUpdateTransfer,
} from "../../types/freee/msw.gen.ts";
import { transferCreateCommand, transferUpdateCommand } from "./write.ts";

const testDir = join(tmpdir(), `freee-cli-transfer-write-test-${Date.now()}`);
const onCreate = mock();
const onUpdate = mock();
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
  handleGetTransfer(() => HttpResponse.json({ transfer })),
  handleCreateTransfer(async ({ request }) => {
    const body = await request.json();
    onCreate(body);
    return HttpResponse.json({ transfer: { ...transfer, ...(body as object) } }, { status: 201 });
  }),
  handleUpdateTransfer(async ({ request }) => {
    const body = await request.json();
    onUpdate(body);
    return HttpResponse.json({ transfer: { ...transfer, ...(body as object) } });
  }),
);
const createArgs = [
  "--company-id",
  "123",
  "--date",
  "2026-08-01",
  "--from-walletable-id",
  "10",
  "--from-walletable-type",
  "bank_account",
  "--to",
  '{"type":"credit_card","id":20,"amount":5000,"description":"card payment"}',
];

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterAll(() => server.close());
beforeEach(() => {
  onCreate.mockClear();
  onUpdate.mockClear();
  mkdirSync(testDir, { recursive: true });
  saveCredentials(testDir, { default: MOCK_TOKEN });
  process.env.FREEE_CLI_CONFIG_DIR = testDir;
});
afterEach(() => {
  server.resetHandlers();
  delete process.env.FREEE_CLI_CONFIG_DIR;
  rmSync(testDir, { recursive: true, force: true });
});

describe("transfer write commands", () => {
  test("creates a transfer with non-deprecated destination rows", async () => {
    await cli(createArgs, transferCreateCommand);
    expect(onCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        company_id: 123,
        from_walletable_id: 10,
        to_walletables: [
          { type: "credit_card", id: 20, amount: 5000, description: "card payment" },
        ],
      }),
    );
    expect(onCreate.mock.calls[0]?.[0]).not.toHaveProperty("to_walletable_id");
  });

  test("updates one field with a full replacement body", async () => {
    await cli(["--company-id", "123", "--id", "42", "--date", "2026-08-02"], transferUpdateCommand);
    expect(onUpdate).toHaveBeenCalledWith({
      company_id: 123,
      date: "2026-08-02",
      from_walletable_id: 10,
      from_walletable_type: "bank_account",
      to_walletables: [{ type: "credit_card", id: 20, amount: 5000, description: "card payment" }],
    });
  });
});
