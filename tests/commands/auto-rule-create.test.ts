import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, mock, test } from "bun:test";
import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { cli } from "gunshi";
import { HttpResponse } from "msw";
import { setupServer } from "msw/node";

import { autoRuleCreateCommand } from "../../src/commands/auto-rule/create.ts";
import { saveCredentials } from "../../src/config/credentials.ts";
import { handleCreateUserMatcher } from "../../src/types/freee/msw.gen.ts";
import { MOCK_TOKEN } from "../fixtures.ts";

const testDir = join(tmpdir(), `freee-cli-auto-rule-create-test-${Date.now()}`);

const onCreateUserMatcher = mock();

const server = setupServer(
  handleCreateUserMatcher(async ({ request }) => {
    const body = await request.json();
    onCreateUserMatcher({
      companyId: new URL(request.url).searchParams.get("company_id"),
      body,
    });
    return HttpResponse.json(
      {
        id: 99,
        act: 1,
        active: true,
        condition: 0,
        description: "AMAZON",
        entry_side_str: "expense",
        priority: 5,
        tax_name: "課対仕入10%",
        account_item_name: "消耗品費",
        qualified_invoice_setting: "non_qualified",
        suggest_tax_from_walletable_invoice: false,
        last_updated_user_id: 1,
        user_name: "tester",
        ...(typeof body === "object" ? body : {}),
      },
      { status: 201 },
    );
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
  onCreateUserMatcher.mockClear();
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
  "--description",
  "AMAZON",
  "--condition",
  "partial",
  "--entry-side",
  "expense",
  "--priority",
  "5",
  "--tax-name",
  "課対仕入10%",
  "--account-item-name",
  "消耗品費",
];

describe("auto-rule create command", () => {
  test("passes optional narrowing fields through, repeating --default-tag", async () => {
    await cli(
      [
        ...baseArgs,
        "--walletable",
        "楽天カード",
        "--min-amount=-10000",
        "--max-amount",
        "50000",
        "--deal-description",
        "Amazon購入",
        "--partner-name",
        "Amazon",
        "--item-name",
        "書籍",
        "--section-name",
        "開発部",
        "--default-tag",
        "経費",
        "--default-tag",
        "自動登録",
      ],
      autoRuleCreateCommand,
    );

    expect(onCreateUserMatcher).toHaveBeenCalledWith({
      companyId: "123",
      body: expect.objectContaining({
        walletable: "楽天カード",
        min_amount: -10000,
        max_amount: 50000,
        deal_description: "Amazon購入",
        partner_name: "Amazon",
        item_name: "書籍",
        section_name: "開発部",
        default_tag_names: ["経費", "自動登録"],
      }),
    });
  });

  test("dry-run validates, prints the payload, and does not call the API", async () => {
    const result = await cli([...baseArgs, "--dry-run"], autoRuleCreateCommand);

    expect(onCreateUserMatcher).not.toHaveBeenCalled();
    if (typeof result !== "string") throw new Error("expected string result");
    expect(result).toContain("Dry run");
    expect(result).toContain('"act": 1');
    expect(result).toContain('"condition": 0');
    expect(result).toContain('"description": "AMAZON"');
  });

  test("--format json returns the created rule as JSON", async () => {
    const result = await cli([...baseArgs, "--format", "json"], autoRuleCreateCommand);

    if (typeof result !== "string") throw new Error("expected string result");
    const rule = JSON.parse(result);
    expect(rule.id).toBe(99);
    expect(rule.act).toBe(1);
    expect(rule.active).toBe(true);
  });

  test("rejects an unknown --condition before calling the API", async () => {
    const args = baseArgs.map((a) => (a === "partial" ? "contains" : a));

    expect(cli(args, autoRuleCreateCommand)).rejects.toThrow(
      /partial, forward, backward, exact, wildcard/,
    );
    expect(onCreateUserMatcher).not.toHaveBeenCalled();
  });

  test("rejects an unknown --entry-side before calling the API", async () => {
    const args = baseArgs.map((a) => (a === "expense" ? "outgo" : a));

    expect(cli(args, autoRuleCreateCommand)).rejects.toThrow(/income, expense/);
    expect(onCreateUserMatcher).not.toHaveBeenCalled();
  });

  test("rejects a non-integer --priority before calling the API", async () => {
    const args = baseArgs.map((a) => (a === "5" ? "1.5" : a));

    expect(cli(args, autoRuleCreateCommand)).rejects.toThrow(/non-negative integer/);
    expect(onCreateUserMatcher).not.toHaveBeenCalled();
  });

  test("rejects a non-integer --min-amount before calling the API", async () => {
    expect(cli([...baseArgs, "--min-amount", "abc"], autoRuleCreateCommand)).rejects.toThrow(
      /integer/,
    );
    expect(onCreateUserMatcher).not.toHaveBeenCalled();
  });

  test("rejects --min-amount greater than --max-amount before calling the API", async () => {
    expect(
      cli([...baseArgs, "--min-amount", "50000", "--max-amount", "10000"], autoRuleCreateCommand),
    ).rejects.toThrow(/--min-amount.*--max-amount/);
    expect(onCreateUserMatcher).not.toHaveBeenCalled();
  });

  // gunshi treats an empty string as a missing value, so blank required fields never reach freee.
  test("rejects empty required strings before calling the API", async () => {
    const emptied = (flag: string) => {
      const args = [...baseArgs];
      args[args.indexOf(flag) + 1] = "";
      return args;
    };

    expect(cli(emptied("--description"), autoRuleCreateCommand)).rejects.toThrow();
    expect(cli(emptied("--tax-name"), autoRuleCreateCommand)).rejects.toThrow();
    expect(cli(emptied("--account-item-name"), autoRuleCreateCommand)).rejects.toThrow();
    expect(onCreateUserMatcher).not.toHaveBeenCalled();
  });

  test("sends an act=1 auto_standard rule with numeric condition code", async () => {
    await cli(baseArgs, autoRuleCreateCommand);

    expect(onCreateUserMatcher).toHaveBeenCalledTimes(1);
    expect(onCreateUserMatcher).toHaveBeenCalledWith({
      companyId: "123",
      body: {
        act: 1,
        active: true,
        condition: 0,
        description: "AMAZON",
        entry_side_str: "expense",
        priority: 5,
        tax_name: "課対仕入10%",
        account_item_name: "消耗品費",
      },
    });
  });
});
