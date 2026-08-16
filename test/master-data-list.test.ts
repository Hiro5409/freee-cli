import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { cli } from "gunshi";
import { HttpResponse } from "msw";
import { setupServer } from "msw/node";

import { sectionListCommand } from "../src/commands/section/list.ts";
import { segmentTagListCommand } from "../src/commands/segment-tag/list.ts";
import { tagListCommand } from "../src/commands/tag/list.ts";
import { saveCredentials } from "../src/config/credentials.ts";
import {
  handleGetSections,
  handleGetSegmentTags,
  handleGetTags,
} from "../src/types/freee/msw.gen.ts";
import { MOCK_TOKEN } from "./credentials.ts";

const testDir = join(tmpdir(), `freee-cli-master-data-list-${Date.now()}`);
let segmentUrl = "";

const server = setupServer(
  handleGetSections(() =>
    HttpResponse.json({
      sections: [{ id: 1, name: "Development", available: true, company_id: 123 }],
    }),
  ),
  handleGetTags(() =>
    HttpResponse.json({
      tags: [{ id: 2, company_id: 123, name: "Reviewed", update_date: "2026-08-01" }],
    }),
  ),
  handleGetSegmentTags(({ request }) => {
    segmentUrl = request.url;
    return HttpResponse.json({
      segment_tags: [
        { id: 3, name: "Product A", description: null, shortcut1: null, shortcut2: null },
      ],
    });
  }),
);

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterAll(() => server.close());
beforeEach(() => {
  segmentUrl = "";
  mkdirSync(testDir, { recursive: true });
  saveCredentials(testDir, { default: MOCK_TOKEN });
  process.env.FREEE_CLI_CONFIG_DIR = testDir;
});
afterEach(() => {
  server.resetHandlers();
  delete process.env.FREEE_CLI_CONFIG_DIR;
  rmSync(testDir, { recursive: true, force: true });
});

describe("accounting master-data list commands", () => {
  test("lists sections", async () => {
    const result = await cli(["--company-id", "123", "--format", "json"], sectionListCommand);
    expect(JSON.parse(String(result))).toEqual([
      { id: 1, name: "Development", available: true, company_id: 123 },
    ]);
  });

  test("lists memo tags", async () => {
    const result = await cli(["--company-id", "123", "--format", "json"], tagListCommand);
    expect(JSON.parse(String(result))[0]).toMatchObject({ id: 2, name: "Reviewed" });
  });

  test("lists one segment's tags", async () => {
    const result = await cli(
      ["--company-id", "123", "--segment", "2", "--format", "json"],
      segmentTagListCommand,
    );
    expect(new URL(segmentUrl).pathname).toBe("/api/1/segments/2/tags");
    expect(JSON.parse(String(result))[0]).toMatchObject({ id: 3, name: "Product A" });
  });
});
