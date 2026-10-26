import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, mock, test } from "bun:test";
import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { cli } from "gunshi";
import { HttpResponse } from "msw/http";

import { MOCK_TOKEN } from "../../../test/credentials.ts";
import { createNetwork } from "../../../test/network.ts";
import { saveCredentials } from "../../config/credentials.ts";
import { handleDestroyDeal } from "../../types/freee/msw.gen.ts";
import { dealDeleteCommand } from "./delete.ts";

const testDir = join(tmpdir(), `freee-cli-deal-delete-test-${Date.now()}`);
const onDelete = mock();
const network = createNetwork(
  handleDestroyDeal(({ request, params }) => {
    onDelete({ id: params.id, companyId: new URL(request.url).searchParams.get("company_id") });
    return new HttpResponse(null, { status: 204 });
  }),
);

beforeAll(() => network.enable());
afterAll(() => network.disable());
beforeEach(() => {
  mkdirSync(testDir, { recursive: true });
  saveCredentials(testDir, { default: MOCK_TOKEN });
  process.env.FREEE_CLI_CONFIG_DIR = testDir;
});
afterEach(() => {
  onDelete.mockClear();
  delete process.env.FREEE_CLI_CONFIG_DIR;
  rmSync(testDir, { recursive: true, force: true });
});

describe("deal delete command", () => {
  test("deletes the requested deal and returns a stable result", async () => {
    const result = await cli(
      ["--company-id", "123", "--id", "42", "--format", "json"],
      dealDeleteCommand,
    );
    expect(onDelete).toHaveBeenCalledWith({ id: "42", companyId: "123" });
    if (typeof result !== "string") throw new Error("expected string result");
    expect(JSON.parse(result)).toEqual({ id: 42, deleted: true });
  });

  test("dry-run does not delete", async () => {
    const result = await cli(
      ["--company-id", "123", "--id", "42", "--dry-run", "--format", "json"],
      dealDeleteCommand,
    );
    expect(onDelete).not.toHaveBeenCalled();
    if (typeof result !== "string") throw new Error("expected string result");
    expect(JSON.parse(result).request).toEqual({
      method: "DELETE",
      path: "/api/1/deals/42",
      query: { company_id: 123 },
    });
  });
});
