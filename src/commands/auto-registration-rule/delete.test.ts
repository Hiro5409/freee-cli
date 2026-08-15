import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, mock, test } from "bun:test";
import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { cli } from "gunshi";
import { HttpResponse } from "msw";
import { setupServer } from "msw/node";

import { MOCK_TOKEN } from "../../../test/credentials.ts";
import { saveCredentials } from "../../config/credentials.ts";
import { handleDestroyUserMatcher } from "../../types/freee/msw.gen.ts";
import { autoRegistrationRuleDeleteCommand } from "./delete.ts";

const testDir = join(tmpdir(), `freee-cli-auto-registration-rule-delete-test-${Date.now()}`);

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

describe("auto-registration rule delete command", () => {
  test("deletes the rule by ID without any interactive prompt", async () => {
    const result = await cli(baseArgs, autoRegistrationRuleDeleteCommand);

    expect(onDestroyUserMatcher).toHaveBeenCalledTimes(1);
    expect(onDestroyUserMatcher).toHaveBeenCalledWith({ id: "42", companyId: "123" });
    if (typeof result !== "string") throw new Error("expected string result");
    expect(result).toContain("id=42");
  });

  test("--format json reports the deleted ID", async () => {
    const result = await cli([...baseArgs, "--format", "json"], autoRegistrationRuleDeleteCommand);

    if (typeof result !== "string") throw new Error("expected string result");
    expect(JSON.parse(result)).toEqual({ id: 42, deleted: true });
  });

  test("dry-run prints the exact endpoint and does not call the API", async () => {
    const result = await cli([...baseArgs, "--dry-run"], autoRegistrationRuleDeleteCommand);

    expect(onDestroyUserMatcher).not.toHaveBeenCalled();
    if (typeof result !== "string") throw new Error("expected string result");
    expect(result).toContain("Dry run");
    expect(result).toContain("DELETE /api/1/user_matchers/42");
  });

  test("rejects a non-positive --id before calling the API", async () => {
    await expect(
      cli(["--company-id", "123", "--id", "0"], autoRegistrationRuleDeleteCommand),
    ).rejects.toThrow(/positive integer/);
    await expect(
      cli(["--company-id", "123", "--id", "abc"], autoRegistrationRuleDeleteCommand),
    ).rejects.toThrow(/positive integer/);
    expect(onDestroyUserMatcher).not.toHaveBeenCalled();
  });
});
