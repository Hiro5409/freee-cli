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
  handleDestroyTransfer,
  handleGetTransfer,
  handleGetTransfers,
  handleUpdateTransfer,
} from "../../types/freee/msw.gen.ts";
import { transferDeleteCommand } from "./delete.ts";
import { transferListCommand } from "./list.ts";
import { transferShowCommand } from "./show.ts";
import { transferCreateCommand, transferUpdateCommand } from "./write.ts";

const testDir = join(tmpdir(), `freee-cli-transfer-test-${Date.now()}`);
const onCreate = mock();
const onUpdate = mock();
const onDelete = mock();
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
  handleDestroyTransfer(({ params }) => {
    onDelete(params.id);
    return new HttpResponse(null, { status: 204 });
  }),
);

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterAll(() => server.close());
beforeEach(() => {
  onCreate.mockClear();
  onUpdate.mockClear();
  onDelete.mockClear();
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

describe("transfer commands", () => {
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

  test("shows one transfer", async () => {
    const result = await cli(
      ["--company-id", "123", "--id", "42", "--format", "json"],
      transferShowCommand,
    );
    expect(JSON.parse(String(result))).toMatchObject({ id: 42 });
  });

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

  test("dry-run previews writes", async () => {
    const createResult = await cli(
      [...createArgs, "--dry-run", "--format", "json"],
      transferCreateCommand,
    );
    const deleteResult = await cli(
      ["--company-id", "123", "--id", "42", "--dry-run", "--format", "json"],
      transferDeleteCommand,
    );
    expect(onCreate).not.toHaveBeenCalled();
    expect(onDelete).not.toHaveBeenCalled();
    expect(JSON.parse(String(createResult))).toMatchObject({ request: { method: "POST" } });
    expect(JSON.parse(String(deleteResult))).toMatchObject({ request: { method: "DELETE" } });
  });

  test("deletes the selected transfer", async () => {
    await cli(["--company-id", "123", "--id", "42"], transferDeleteCommand);
    expect(onDelete).toHaveBeenCalledWith("42");
  });
});
