import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { cli } from "gunshi";
import { HttpResponse } from "msw/http";

import { MOCK_TOKEN } from "../../../test/credentials.ts";
import { createNetwork } from "../../../test/network.ts";
import { saveCredentials } from "../../config/credentials.ts";
import { handleGetTags } from "../../types/freee/msw.gen.ts";
import { tagListCommand } from "./list.ts";

const testDir = join(tmpdir(), `freee-cli-tag-list-test-${Date.now()}`);
const network = createNetwork(
  handleGetTags(() =>
    HttpResponse.json({
      tags: [{ id: 2, company_id: 123, name: "Reviewed", update_date: "2026-08-01" }],
    }),
  ),
);

beforeAll(() => network.enable());
afterAll(() => network.disable());
beforeEach(() => {
  mkdirSync(testDir, { recursive: true });
  saveCredentials(testDir, { default: MOCK_TOKEN });
  process.env.FREEE_CLI_CONFIG_DIR = testDir;
});
afterEach(() => {
  network.resetHandlers();
  delete process.env.FREEE_CLI_CONFIG_DIR;
  rmSync(testDir, { recursive: true, force: true });
});

describe("tag list command", () => {
  test("lists memo tags", async () => {
    const result = await cli(["--company-id", "123", "--format", "json"], tagListCommand);
    expect(JSON.parse(String(result))[0]).toMatchObject({ id: 2, name: "Reviewed" });
  });
});
