import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, mock, test } from "bun:test";
import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { cli } from "gunshi";
import { HttpResponse } from "msw";
import { setupServer } from "msw/node";

import { autoRuleDeleteCommand } from "../../src/commands/auto-rule/delete.ts";
import { saveCredentials } from "../../src/config/credentials.ts";
import { handleDestroyUserMatcher } from "../../src/types/freee/msw.gen.ts";
import { MOCK_TOKEN } from "../fixtures.ts";

const testDir = join(tmpdir(), `freee-cli-auto-rule-delete-test-${Date.now()}`);

const onDestroyUserMatcher = mock();

const server = setupServer(
  handleDestroyUserMatcher(({ request, params }) => {
    onDestroyUserMatcher({
      id: params.id,
      companyId: new URL(request.url).searchParams.get("company_id"),
    });
    return new HttpResponse(null, { status: 204 });
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
  onDestroyUserMatcher.mockClear();
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

describe("auto-rule delete command", () => {
  test("deletes the rule by ID without any interactive prompt", async () => {
    const result = await cli(baseArgs, autoRuleDeleteCommand);

    expect(onDestroyUserMatcher).toHaveBeenCalledTimes(1);
    expect(onDestroyUserMatcher).toHaveBeenCalledWith({ id: "42", companyId: "123" });
    if (typeof result !== "string") throw new Error("expected string result");
    expect(result).toContain("id=42");
  });

  test("--format json reports the deleted ID", async () => {
    const result = await cli([...baseArgs, "--format", "json"], autoRuleDeleteCommand);

    if (typeof result !== "string") throw new Error("expected string result");
    expect(JSON.parse(result)).toEqual({ id: 42, deleted: true });
  });

  test("dry-run prints the exact endpoint and does not call the API", async () => {
    const result = await cli([...baseArgs, "--dry-run"], autoRuleDeleteCommand);

    expect(onDestroyUserMatcher).not.toHaveBeenCalled();
    if (typeof result !== "string") throw new Error("expected string result");
    expect(result).toContain("Dry run");
    expect(result).toContain("DELETE /api/1/user_matchers/42");
  });

  test("rejects a non-positive or missing --id before calling the API", async () => {
    await expect(cli(["--company-id", "123", "--id", "0"], autoRuleDeleteCommand)).rejects.toThrow(
      /positive integer/,
    );
    await expect(
      cli(["--company-id", "123", "--id", "abc"], autoRuleDeleteCommand),
    ).rejects.toThrow(/positive integer/);
    await expect(cli(["--company-id", "123"], autoRuleDeleteCommand)).rejects.toThrow();
    expect(onDestroyUserMatcher).not.toHaveBeenCalled();
  });
});
