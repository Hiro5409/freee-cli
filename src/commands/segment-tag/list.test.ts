import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { cli } from "gunshi";
import { HttpResponse } from "msw/http";

import { MOCK_TOKEN } from "../../../test/credentials.ts";
import { createNetwork } from "../../../test/network.ts";
import { saveCredentials } from "../../config/credentials.ts";
import { handleGetSegmentTags } from "../../types/freee/msw.gen.ts";
import { segmentTagListCommand } from "./list.ts";

const testDir = join(tmpdir(), `freee-cli-segment-tag-list-test-${Date.now()}`);
let segmentUrl = "";
const network = createNetwork(
  handleGetSegmentTags(({ request }) => {
    segmentUrl = request.url;
    return HttpResponse.json({
      segment_tags: [
        { id: 3, name: "Product A", description: null, shortcut1: null, shortcut2: null },
      ],
    });
  }),
);

beforeAll(() => network.enable());
afterAll(() => network.disable());
beforeEach(() => {
  segmentUrl = "";
  mkdirSync(testDir, { recursive: true });
  saveCredentials(testDir, { default: MOCK_TOKEN });
  process.env.FREEE_CLI_CONFIG_DIR = testDir;
});
afterEach(() => {
  network.resetHandlers();
  delete process.env.FREEE_CLI_CONFIG_DIR;
  rmSync(testDir, { recursive: true, force: true });
});

describe("segment tag list command", () => {
  test("lists one segment's tags", async () => {
    const result = await cli(
      ["--company-id", "123", "--segment", "2", "--format", "json"],
      segmentTagListCommand,
    );
    expect(new URL(segmentUrl).pathname).toBe("/api/1/segments/2/tags");
    expect(JSON.parse(String(result))[0]).toMatchObject({ id: 3, name: "Product A" });
  });
});
