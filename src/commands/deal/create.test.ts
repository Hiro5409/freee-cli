import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, mock, test } from "bun:test";
import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { cli } from "gunshi";
import { HttpResponse } from "msw";
import { setupServer } from "msw/node";

import { MOCK_TOKEN } from "../../../test/credentials.ts";
import { saveCredentials } from "../../config/credentials.ts";
import { handleCreateDeal } from "../../types/freee/msw.gen.ts";
import { dealCreateCommand } from "./create.ts";

const testDir = join(tmpdir(), `freee-cli-deal-create-test-${Date.now()}`);

const onCreateDeal = mock();

const server = setupServer(
  handleCreateDeal(async ({ request }) => {
    const body = await request.json();
    onCreateDeal(body);
    return HttpResponse.json({ deal: { id: 42, ...body, status: "unsettled" } }, { status: 201 });
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
  onCreateDeal.mockClear();
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
  "--date",
  "2026-03-15",
  "--type",
  "expense",
  "--account-item-id",
  "101",
  "--tax-code",
  "21",
  "--amount",
  "10000",
  "--description",
  "テスト経費",
];

describe("deal create command", () => {
  test("sends correct request body to API", async () => {
    await cli(baseArgs, dealCreateCommand);

    expect(onCreateDeal).toHaveBeenCalledTimes(1);
    expect(onCreateDeal).toHaveBeenCalledWith(
      expect.objectContaining({
        company_id: 123,
        issue_date: "2026-03-15",
        type: "expense",
        details: expect.arrayContaining([
          expect.objectContaining({
            account_item_id: 101,
            tax_code: 21,
            amount: 10000,
          }),
        ]),
      }),
    );
  });

  test("includes partner_id when provided", async () => {
    await cli([...baseArgs, "--partner-id", "55"], dealCreateCommand);

    expect(onCreateDeal).toHaveBeenCalledWith(expect.objectContaining({ partner_id: 55 }));
  });

  test("validates the payload before writing", async () => {
    await expect(
      cli([...baseArgs, "--type", "invalid", "--amount", "not-a-number"], dealCreateCommand),
    ).rejects.toThrow('--type must be "income" or "expense"');

    expect(onCreateDeal).not.toHaveBeenCalled();
  });

  test("rejects an invalid calendar date", async () => {
    const args = baseArgs.map((arg) => (arg === "2026-03-15" ? "2026-02-30" : arg));

    await expect(cli(args, dealCreateCommand)).rejects.toThrow(/YYYY-MM-DD/);
    expect(onCreateDeal).not.toHaveBeenCalled();
  });

  test("rejects malformed IDs and non-integer amounts before calling the API", async () => {
    const invalidArguments: [[string, ...string[]], RegExp][] = [
      [["--account-item-id", "0x10"], /positive integer/],
      [["--tax-code=-1"], /non-negative integer/],
      [["--amount", "1.5"], /integer/],
      [["--partner-id", "Infinity"], /positive integer/],
    ];
    for (const [replacement, message] of invalidArguments) {
      const flag = replacement[0].replace(/=.*/, "");
      const index = baseArgs.indexOf(flag);
      const args =
        index === -1 ? [...baseArgs, ...replacement] : baseArgs.toSpliced(index, 2, ...replacement);
      await expect(cli(args, dealCreateCommand)).rejects.toThrow(message);
    }
    expect(onCreateDeal).not.toHaveBeenCalled();
  });

  test("--format json returns the created deal response", async () => {
    const result = await cli([...baseArgs, "--format", "json"], dealCreateCommand);

    if (typeof result !== "string") throw new Error("expected string result");
    expect(JSON.parse(result).id).toBe(42);
  });
});
