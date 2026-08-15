import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, mock, test } from "bun:test";
import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { cli } from "gunshi";
import { HttpResponse } from "msw";
import { setupServer } from "msw/node";

import { MOCK_TOKEN } from "../../../test/credentials.ts";
import { saveCredentials } from "../../config/credentials.ts";
import { handleGetUserMatcher, handleUpdateUserMatcher } from "../../types/freee/msw.gen.ts";
import {
  autoRegistrationRuleDisableCommand,
  autoRegistrationRuleEnableCommand,
} from "./set-active.ts";
import { createMockUserMatcher } from "./test-fixtures.ts";

const testDir = join(tmpdir(), `freee-cli-auto-registration-rule-set-active-test-${Date.now()}`);

const onGetUserMatcher = mock();
const onUpdateUserMatcher = mock();
let currentActive = true;

const server = setupServer(
  handleGetUserMatcher(() => {
    onGetUserMatcher();
    return HttpResponse.json(createMockUserMatcher({ id: 42, active: currentActive }));
  }),
  handleUpdateUserMatcher(async ({ request, params }) => {
    const body = await request.json();
    onUpdateUserMatcher({ id: params.id, body });
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
  onGetUserMatcher.mockClear();
  onUpdateUserMatcher.mockClear();
  currentActive = true;
  mkdirSync(testDir, { recursive: true });
  saveCredentials(testDir, { default: MOCK_TOKEN });
  process.env.FREEE_CLI_CONFIG_DIR = testDir;
});

afterEach(() => {
  server.resetHandlers();
  delete process.env.FREEE_CLI_CONFIG_DIR;
  rmSync(testDir, { recursive: true, force: true });
});

const baseArgs = ["--company-id", "123", "--id", "42"];

// Every mutable field from createMockUserMatcher, as the full-state PUT must resend it.
const preservedFields = {
  act: 1,
  condition: 0,
  description: "AMAZON",
  entry_side_str: "expense",
  priority: 5,
  tax_name: "課対仕入10%",
  walletable: "楽天カード",
  card_label: "メインカード",
  card_label_id: 7,
  transfer_walletable: null,
  min_amount: 100,
  max_amount: 50000,
  deal_description: "Amazon購入",
  qualified_invoice_setting: "non_qualified",
  suggest_tax_from_walletable_invoice: false,
  account_item_name: "消耗品費",
  partner_name: "Amazon",
  item_name: "書籍",
  section_name: "開発部",
  division_tag_1_name: "セグメントA",
  division_tag_2_name: "セグメントB",
  division_tag_3_name: "セグメントC",
  default_tag_names: ["経費", "自動登録"],
};

describe("auto-registration rule disable command", () => {
  test("PUTs the full current state with only active flipped to false", async () => {
    currentActive = true;
    await cli(baseArgs, autoRegistrationRuleDisableCommand);

    expect(onUpdateUserMatcher).toHaveBeenCalledTimes(1);
    // Strict equality: read-only fields (id, tax_code, updated_at, …) must not be resent.
    expect(onUpdateUserMatcher).toHaveBeenCalledWith({
      id: "42",
      body: { ...preservedFields, active: false },
    });
  });

  test("reports the new state", async () => {
    const result = await cli(baseArgs, autoRegistrationRuleDisableCommand);

    if (typeof result !== "string") throw new Error("expected string result");
    expect(result).toContain("id=42");
    expect(result).toContain("disabled");
  });

  test("dry-run fetches the rule but does not PUT, printing the payload", async () => {
    const result = await cli([...baseArgs, "--dry-run"], autoRegistrationRuleDisableCommand);

    expect(onGetUserMatcher).toHaveBeenCalledTimes(1);
    expect(onUpdateUserMatcher).not.toHaveBeenCalled();
    if (typeof result !== "string") throw new Error("expected string result");
    expect(result).toContain("Dry run");
    expect(result).toContain("/api/1/user_matchers/42");
    expect(result).toContain('"active": false');
  });

  test("rejects a non-positive --id before calling the API", async () => {
    await expect(
      cli(["--company-id", "123", "--id", "0"], autoRegistrationRuleDisableCommand),
    ).rejects.toThrow(/positive integer/);
    expect(onGetUserMatcher).not.toHaveBeenCalled();
    expect(onUpdateUserMatcher).not.toHaveBeenCalled();
  });
});

describe("auto-registration rule enable command", () => {
  test("PUTs the full current state with only active flipped to true", async () => {
    currentActive = false;
    await cli(baseArgs, autoRegistrationRuleEnableCommand);

    expect(onUpdateUserMatcher).toHaveBeenCalledWith({
      id: "42",
      body: { ...preservedFields, active: true },
    });
  });

  // freee's PUT is full-state: omitted optional fields are overwritten as unset (null), so
  // omitting and sending null are equivalent. The meaningful failure is inventing a real
  // value for a booking field the rule does not carry, or dropping a field it does carry.
  test("does not invent values for booking fields a transfer rule lacks", async () => {
    server.use(
      handleGetUserMatcher(() => {
        onGetUserMatcher();
        return HttpResponse.json(
          createMockUserMatcher({
            id: 42,
            act: 3,
            active: false,
            transfer_walletable: "普通預金",
            tax_name: undefined,
            account_item_name: undefined,
            partner_name: undefined,
            item_name: undefined,
            section_name: undefined,
            division_tag_1_name: undefined,
            division_tag_2_name: undefined,
            division_tag_3_name: undefined,
            default_tag_names: undefined,
          }),
        );
      }),
    );

    await cli(baseArgs, autoRegistrationRuleEnableCommand);

    expect(onUpdateUserMatcher).toHaveBeenCalledTimes(1);
    const { id, body } = onUpdateUserMatcher.mock.calls[0]?.[0] ?? { id: "", body: {} };
    expect(id).toBe("42");
    expect(body).toMatchObject({ act: 3, active: true, transfer_walletable: "普通預金" });
    const bookingFields = [
      "tax_name",
      "account_item_name",
      "partner_name",
      "item_name",
      "section_name",
      "division_tag_1_name",
      "division_tag_2_name",
      "division_tag_3_name",
      "default_tag_names",
    ];
    for (const field of bookingFields) {
      expect(body[field] ?? null).toBeNull();
    }
  });

  test("--format json returns the updated rule", async () => {
    currentActive = false;
    const result = await cli([...baseArgs, "--format", "json"], autoRegistrationRuleEnableCommand);

    if (typeof result !== "string") throw new Error("expected string result");
    const rule = JSON.parse(result);
    expect(rule.id).toBe(42);
    expect(rule.active).toBe(true);
  });
});
