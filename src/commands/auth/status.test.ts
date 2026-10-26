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
test("authentication status separates API access from an unconfigured browser company", async () => {
  process.env.FREEE_CLI_CONFIG_DIR = directory;
  saveCredentials(directory, { business: MOCK_TOKEN });
  const result = await cli(["--profile", "business", "--format", "json"], statusCommand);
  expect(JSON.parse(String(result))).toMatchObject({
    profile: "business",
    companyId: null,
    api: { status: "ready" },
    web: { status: "not_configured" },
  });
});

test("authentication status reports API company mismatch independently of missing browser login", async () => {
  process.env.FREEE_CLI_CONFIG_DIR = directory;
  saveCredentials(directory, { business: MOCK_TOKEN });
  saveConfig(directory, {
    activeProfile: "business",
    defaults: { format: "json" },
    profiles: { business: { companyId: 99, name: "Other" } },
  });
  const previousHome = process.env.HOME;
  const previousKey = process.env.AGENT_BROWSER_ENCRYPTION_KEY;
  process.env.HOME = directory;
  delete process.env.AGENT_BROWSER_ENCRYPTION_KEY;
  try {
    const result = await cli(["--profile", "business", "--format", "json"], statusCommand);
    expect(JSON.parse(String(result))).toMatchObject({
      companyId: 99,
      api: { status: "company_mismatch" },
      web: { status: "login_required" },
    });
  } finally {
    if (previousHome === undefined) delete process.env.HOME;
    else process.env.HOME = previousHome;
    if (previousKey === undefined) delete process.env.AGENT_BROWSER_ENCRYPTION_KEY;
    else process.env.AGENT_BROWSER_ENCRYPTION_KEY = previousKey;
  }
});
