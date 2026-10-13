import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { cli } from "gunshi";
import { HttpResponse } from "msw";
import { setupServer } from "msw/node";

import { MOCK_TOKEN } from "../../../test/credentials.ts";
import { saveCredentials } from "../../config/credentials.ts";
import { handleGetSections } from "../../types/freee/msw.gen.ts";
import { sectionListCommand } from "./list.ts";

const testDir = join(tmpdir(), `freee-cli-section-list-test-${Date.now()}`);
const server = setupServer(
  handleGetSections(() =>
    HttpResponse.json({
      sections: [{ id: 1, name: "Development", available: true, company_id: 123 }],
    }),
  ),
);

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterAll(() => server.close());
beforeEach(() => {
  mkdirSync(testDir, { recursive: true });
  saveCredentials(testDir, { default: MOCK_TOKEN });
  process.env.FREEE_CLI_CONFIG_DIR = testDir;
});
afterEach(() => {
  server.resetHandlers();
  delete process.env.FREEE_CLI_CONFIG_DIR;
  rmSync(testDir, { recursive: true, force: true });
});

describe("section list command", () => {
  test("lists sections", async () => {
    const result = await cli(["--company-id", "123", "--format", "json"], sectionListCommand);
    expect(JSON.parse(String(result))).toEqual([
      { id: 1, name: "Development", available: true, company_id: 123 },
    ]);
  });
});
