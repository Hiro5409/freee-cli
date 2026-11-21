import { afterAll, afterEach, beforeAll, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { cli } from "gunshi";
import { http, HttpResponse } from "msw/http";

import { MOCK_TOKEN } from "../../../test/credentials.ts";
import { createNetwork } from "../../../test/network.ts";
import { saveConfig } from "../../config/config.ts";
import { saveCredentials } from "../../config/credentials.ts";
import { statusCommand } from "./status.ts";

const network = createNetwork(
  http.get("https://api.freee.co.jp/api/1/companies", () =>
    HttpResponse.json({ companies: [{ id: 42, display_name: "Business" }] }),
  ),
);
beforeAll(() => network.enable());
afterAll(() => network.disable());
const directory = mkdtempSync(join(tmpdir(), "freee-auth-status-"));
const previousDirectory = process.env.FREEE_CLI_CONFIG_DIR;
afterEach(() => {
  if (previousDirectory === undefined) delete process.env.FREEE_CLI_CONFIG_DIR;
  else process.env.FREEE_CLI_CONFIG_DIR = previousDirectory;
  rmSync(directory, { recursive: true, force: true });
});
test("authentication status reports API access for a profile without a company", async () => {
  process.env.FREEE_CLI_CONFIG_DIR = directory;
  saveCredentials(directory, { business: MOCK_TOKEN });
  const result = await cli(["--profile", "business"], statusCommand);
  expect(JSON.parse(String(result))).toMatchObject({
    profile: "business",
    companyId: null,
    api: { status: "ready" },
  });
});

test("authentication status reports a company the API credentials cannot access", async () => {
  process.env.FREEE_CLI_CONFIG_DIR = directory;
  saveCredentials(directory, { business: MOCK_TOKEN });
  saveConfig(directory, {
    activeProfile: "business",
    profiles: { business: { companyId: 99, name: "Other" } },
  });
  const result = await cli(["--profile", "business"], statusCommand);
  expect(JSON.parse(String(result))).toMatchObject({
    companyId: 99,
    api: { status: "company_mismatch" },
  });
});
