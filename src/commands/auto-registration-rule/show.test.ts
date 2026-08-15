import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, mock, test } from "bun:test";
import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { cli } from "gunshi";
import { HttpResponse } from "msw";
import { setupServer } from "msw/node";

import { MOCK_TOKEN } from "../../../test/credentials.ts";
import { saveCredentials } from "../../config/credentials.ts";
import { handleGetUserMatcher } from "../../types/freee/msw.gen.ts";
import { autoRegistrationRuleShowCommand } from "./show.ts";
import { createMockUserMatcher } from "./test-fixtures.ts";

const testDir = join(tmpdir(), `freee-cli-auto-registration-rule-show-test-${Date.now()}`);

const onGetUserMatcher = mock();

const server = setupServer(
  handleGetUserMatcher(({ request, params }) => {
    onGetUserMatcher({
      id: params.id,
      companyId: new URL(request.url).searchParams.get("company_id"),
    });
    return HttpResponse.json(createMockUserMatcher({ id: 42, description: "AMAZON" }));
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
  mkdirSync(testDir, { recursive: true });
  saveCredentials(testDir, { default: MOCK_TOKEN });
  process.env.FREEE_CLI_CONFIG_DIR = testDir;
});

afterEach(() => {
  server.resetHandlers();
  delete process.env.FREEE_CLI_CONFIG_DIR;
  rmSync(testDir, { recursive: true, force: true });
});

describe("auto-registration rule show command", () => {
  test("fetches the rule by ID and outputs it as JSON", async () => {
    const result = await cli(
      ["--company-id", "123", "--format", "json", "--id", "42"],
      autoRegistrationRuleShowCommand,
    );

    expect(onGetUserMatcher).toHaveBeenCalledWith({ id: "42", companyId: "123" });
    if (typeof result !== "string") throw new Error("expected string result");
    const rule = JSON.parse(result);
    expect(rule.id).toBe(42);
    expect(rule.description).toBe("AMAZON");
  });

  test("rejects a non-positive --id before calling the API", async () => {
    await expect(
      cli(["--company-id", "123", "--id", "0"], autoRegistrationRuleShowCommand),
    ).rejects.toThrow(/positive integer/);
    expect(onGetUserMatcher).not.toHaveBeenCalled();
  });
});
