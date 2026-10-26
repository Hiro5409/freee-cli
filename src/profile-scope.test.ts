import { afterEach, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { MOCK_TOKEN } from "../test/credentials.ts";
import { saveConfig } from "./config/config.ts";
import { saveCredentials } from "./config/credentials.ts";
import { resolveFreeeScope } from "./profiles.ts";

const directory = mkdtempSync(join(tmpdir(), "freee-web-scope-"));
const previousDirectory = process.env.FREEE_CLI_CONFIG_DIR;
afterEach(() => {
  if (previousDirectory === undefined) delete process.env.FREEE_CLI_CONFIG_DIR;
  else process.env.FREEE_CLI_CONFIG_DIR = previousDirectory;
  rmSync(directory, { recursive: true, force: true });
});

test("The selected connection profile resolves to its configured company", () => {
  process.env.FREEE_CLI_CONFIG_DIR = directory;
  saveCredentials(directory, { business: MOCK_TOKEN, other: MOCK_TOKEN });
  saveConfig(directory, {
    activeProfile: "other",
    defaults: { format: "table" },
    profiles: {
      business: { companyId: 42, name: "Business" },
      other: { companyId: 99, name: "Other" },
    },
  });
  expect(resolveFreeeScope("business")).toEqual({ profile: "business", companyId: 42 });
  expect(() => resolveFreeeScope("missing")).toThrow('No credentials found for profile "missing"');
});
