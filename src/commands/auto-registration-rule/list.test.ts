import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, mock, test } from "bun:test";
import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { cli } from "gunshi";
import { HttpResponse } from "msw";
import { setupServer } from "msw/node";

import { MOCK_TOKEN } from "../../../test/credentials.ts";
import { saveCredentials } from "../../config/credentials.ts";
import { handleGetUserMatchers } from "../../types/freee/msw.gen.ts";
import { autoRegistrationRuleListCommand } from "./list.ts";
import { createMockUserMatcher } from "./test-fixtures.ts";

const testDir = join(tmpdir(), `freee-cli-auto-registration-rule-list-test-${Date.now()}`);

const onGetUserMatchers = mock();

const server = setupServer(
  handleGetUserMatchers(({ request }) => {
    onGetUserMatchers(Object.fromEntries(new URL(request.url).searchParams));
    return HttpResponse.json({
      data: [
        createMockUserMatcher({ id: 1, description: "AMAZON", active: true }),
        createMockUserMatcher({ id: 2, description: "GITHUB", active: false }),
      ],
    });
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
  onGetUserMatchers.mockClear();
  mkdirSync(testDir, { recursive: true });
  saveCredentials(testDir, { default: MOCK_TOKEN });
  process.env.FREEE_CLI_CONFIG_DIR = testDir;
});

afterEach(() => {
  server.resetHandlers();
  delete process.env.FREEE_CLI_CONFIG_DIR;
  rmSync(testDir, { recursive: true, force: true });
});

const baseArgs = ["--company-id", "123", "--format", "json"];

describe("auto-registration rule list command", () => {
  test("outputs all rules as JSON, paginating with company_id/limit/offset", async () => {
    const result = await cli(baseArgs, autoRegistrationRuleListCommand);

    expect(onGetUserMatchers).toHaveBeenCalledWith(
      expect.objectContaining({ company_id: "123", limit: "100", offset: "0" }),
    );
    if (typeof result !== "string") throw new Error("expected string result");
    const rules = JSON.parse(result);
    expect(rules).toHaveLength(2);
    expect(rules[0].id).toBe(1);
    expect(rules[1].active).toBe(false);
  });

  test("passes --active, --description, --entry-side, and --walletable as query filters", async () => {
    await cli(
      [
        ...baseArgs,
        "--active",
        "inactive",
        "--description",
        "AMAZON",
        "--entry-side",
        "expense",
        "--walletable",
        "楽天カード",
      ],
      autoRegistrationRuleListCommand,
    );

    expect(onGetUserMatchers).toHaveBeenCalledWith(
      expect.objectContaining({
        active: "inactive",
        description: "AMAZON",
        entry_side_str: "expense",
        walletable: "楽天カード",
      }),
    );
  });

  test("rejects an unknown --active before calling the API", async () => {
    await expect(
      cli([...baseArgs, "--active", "on"], autoRegistrationRuleListCommand),
    ).rejects.toThrow();
    expect(onGetUserMatchers).not.toHaveBeenCalled();
  });
});
