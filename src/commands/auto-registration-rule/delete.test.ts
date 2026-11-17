import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, mock, test } from "bun:test";
import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { cli } from "gunshi";
import { HttpResponse } from "msw/http";

import { MOCK_TOKEN } from "../../../test/credentials.ts";
import { createNetwork } from "../../../test/network.ts";
import { saveCredentials } from "../../config/credentials.ts";
import { handleDestroyUserMatcher } from "../../types/freee/msw.gen.ts";
import { autoRegistrationRuleDeleteCommand } from "./delete.ts";

const testDir = join(tmpdir(), `freee-cli-auto-registration-rule-delete-test-${Date.now()}`);

const onDestroyUserMatcher = mock();

const network = createNetwork(
  handleDestroyUserMatcher(({ request, params }) => {
    onDestroyUserMatcher({
      id: params.id,
      companyId: new URL(request.url).searchParams.get("company_id"),
    });
    return new HttpResponse(null, { status: 204 });
  }),
);

beforeAll(() => network.enable());
afterAll(() => network.disable());

beforeEach(() => {
  onDestroyUserMatcher.mockClear();
  mkdirSync(testDir, { recursive: true });
  saveCredentials(testDir, { default: MOCK_TOKEN });
  process.env.FREEE_CLI_CONFIG_DIR = testDir;
});

afterEach(() => {
  network.resetHandlers();
  delete process.env.FREEE_CLI_CONFIG_DIR;
  rmSync(testDir, { recursive: true, force: true });
});

const baseArgs = ["--company-id", "123", "--id", "42"];

describe("auto-registration rule delete command", () => {
  test("deletes the rule by ID without any interactive prompt", async () => {
    const result = await cli(baseArgs, autoRegistrationRuleDeleteCommand);

    expect(onDestroyUserMatcher).toHaveBeenCalledTimes(1);
    expect(onDestroyUserMatcher).toHaveBeenCalledWith({ id: "42", companyId: "123" });
    expect(JSON.parse(String(result))).toEqual({ id: 42, deleted: true });
  });

  test("dry-run prints the exact endpoint and does not call the API", async () => {
    const result = await cli([...baseArgs, "--dry-run"], autoRegistrationRuleDeleteCommand);

    expect(onDestroyUserMatcher).not.toHaveBeenCalled();
    expect(JSON.parse(String(result)).request).toEqual({
      method: "DELETE",
      path: "/api/1/user_matchers/42",
      query: { company_id: 123 },
    });
  });
});
