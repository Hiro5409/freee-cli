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
  handleCreateUserMatcher,
  handleGetUserMatcher,
  handleUpdateUserMatcher,
} from "../../types/freee/msw.gen.ts";
import { createMockUserMatcher } from "./test-fixtures.ts";
import { autoRegistrationRuleCreateCommand, autoRegistrationRuleUpdateCommand } from "./write.ts";

const testDir = join(tmpdir(), `freee-cli-auto-registration-rule-write-test-${Date.now()}`);
const onCreate = mock();
const onUpdate = mock();

const server = setupServer(
  handleCreateUserMatcher(async ({ request }) => {
    const body = await request.json();
    onCreate(body);
    return HttpResponse.json(createMockUserMatcher({ id: 99, ...(body as object) }), {
      status: 201,
    });
  }),
  handleGetUserMatcher(() => HttpResponse.json(createMockUserMatcher({ id: 42 }))),
  handleUpdateUserMatcher(async ({ request }) => {
    const body = await request.json();
    onUpdate(body);
    return HttpResponse.json(createMockUserMatcher({ id: 42, ...(body as object) }));
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

const createBase = [
  "--company-id",
  "123",
  "--description",
  "振込",
  "--condition",
  "exact",
  "--entry-side",
  "expense",
  "--priority",
  "5",
];

describe("auto-registration rule create command", () => {
  test.each([
    ["manual-standard", 0, ["--tax-name", "課対仕入10%", "--account-item-name", "消耗品費"]],
    ["auto-standard", 1, ["--tax-name", "課対仕入10%", "--account-item-name", "消耗品費"]],
    ["manual-transfer", 2, ["--transfer-walletable", "普通預金"]],
    ["auto-transfer", 3, ["--transfer-walletable", "普通預金"]],
    ["auto-ignore", 4, []],
    ["manual-ignore", 10, []],
    ["manual-private", 11, []],
    ["auto-private", 12, []],
  ] as const)("maps %s to act=%i", async (act, code, extra) => {
    await cli([...createBase, "--act", act, ...extra], autoRegistrationRuleCreateCommand);

    expect(onCreate).toHaveBeenCalledWith(expect.objectContaining({ act: code }));
  });

  test("creates a transfer suggestion rule", async () => {
    await cli(
      [...createBase, "--act", "manual-transfer", "--transfer-walletable", "普通預金"],
      autoRegistrationRuleCreateCommand,
    );

    expect(onCreate).toHaveBeenCalledWith(
      expect.objectContaining({ act: 2, transfer_walletable: "普通預金" }),
    );
  });

  test("requires booking fields for a standard deal rule", async () => {
    await expect(
      cli([...createBase, "--act", "auto-standard"], autoRegistrationRuleCreateCommand),
    ).rejects.toThrow(/--tax-name.*--account-item-name/);
    expect(onCreate).not.toHaveBeenCalled();
  });
});

describe("auto-registration rule update command", () => {
  test("clears nullable fields and preserves unmentioned fields", async () => {
    const result = await cli(
      [
        "--company-id",
        "123",
        "--id",
        "42",
        "--clear",
        "walletable",
        "--clear",
        "min-amount",
        "--clear",
        "qualified-invoice-setting",
        "--clear",
        "suggest-tax-from-walletable-invoice",
        "--clear",
        "division-tag-1-name",
        "--dry-run",
        "--format",
        "json",
      ],
      autoRegistrationRuleUpdateCommand,
    );

    expect(onUpdate).not.toHaveBeenCalled();
    expect(JSON.parse(String(result)).request.body).toMatchObject({
      walletable: null,
      min_amount: null,
      qualified_invoice_setting: null,
      suggest_tax_from_walletable_invoice: null,
      division_tag_1_name: null,
      max_amount: 50000,
      partner_name: "Amazon",
    });
  });

  test("rejects setting and clearing the same field", async () => {
    await expect(
      cli(
        [
          "--company-id",
          "123",
          "--id",
          "42",
          "--walletable",
          "楽天カード",
          "--clear",
          "walletable",
          "--dry-run",
        ],
        autoRegistrationRuleUpdateCommand,
      ),
    ).rejects.toThrow(/both set and clear/);
    expect(onUpdate).not.toHaveBeenCalled();
  });

  test("requires a partner when invoice qualification depends on it", async () => {
    server.use(
      handleGetUserMatcher(() =>
        HttpResponse.json(
          createMockUserMatcher({
            id: 42,
            qualified_invoice_setting: "depends_on_partner",
            partner_name: "Amazon",
          }),
        ),
      ),
    );

    await expect(
      cli(
        ["--company-id", "123", "--id", "42", "--clear", "partner-name", "--dry-run"],
        autoRegistrationRuleUpdateCommand,
      ),
    ).rejects.toThrow(/depends-on-partner.*partner-name/);
    expect(onUpdate).not.toHaveBeenCalled();

    const result = await cli(
      [
        "--company-id",
        "123",
        "--id",
        "42",
        "--clear",
        "partner-name",
        "--clear",
        "qualified-invoice-setting",
        "--dry-run",
        "--format",
        "json",
      ],
      autoRegistrationRuleUpdateCommand,
    );
    expect(JSON.parse(String(result)).request.body).toMatchObject({
      partner_name: null,
      qualified_invoice_setting: null,
    });
  });

  test("allows clearing the partner when the final action ignores invoice qualification", async () => {
    server.use(
      handleGetUserMatcher(() =>
        HttpResponse.json(
          createMockUserMatcher({
            id: 42,
            qualified_invoice_setting: "depends_on_partner",
            partner_name: "Amazon",
          }),
        ),
      ),
    );

    const result = await cli(
      [
        "--company-id",
        "123",
        "--id",
        "42",
        "--act",
        "auto-transfer",
        "--transfer-walletable",
        "普通預金",
        "--clear",
        "partner-name",
        "--dry-run",
        "--format",
        "json",
      ],
      autoRegistrationRuleUpdateCommand,
    );

    expect(JSON.parse(String(result)).request.body).toMatchObject({
      act: 3,
      partner_name: null,
      qualified_invoice_setting: "depends_on_partner",
    });
  });

  test("fetches the full rule and changes only requested fields", async () => {
    await cli(
      [
        "--company-id",
        "123",
        "--id",
        "42",
        "--account-item-name",
        "通信費",
        "--deal-description",
        "開発用サービス",
      ],
      autoRegistrationRuleUpdateCommand,
    );

    expect(onUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        act: 1,
        active: true,
        description: "AMAZON",
        tax_name: "課対仕入10%",
        account_item_name: "通信費",
        deal_description: "開発用サービス",
      }),
    );
  });

  test("dry-run does not update freee", async () => {
    const result = await cli(
      ["--company-id", "123", "--id", "42", "--priority", "10", "--dry-run"],
      autoRegistrationRuleUpdateCommand,
    );

    expect(onUpdate).not.toHaveBeenCalled();
    expect(String(result)).toContain("Dry run");
    expect(String(result)).toContain('"priority": 10');
  });
});
