import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { cli } from "gunshi";

import { MOCK_TOKEN } from "../../../test/credentials.ts";
import { createNetwork } from "../../../test/network.ts";
import { saveCredentials } from "../../config/credentials.ts";
import { dealPaymentDeleteCommand } from "./payment-delete.ts";

const testDir = join(tmpdir(), `freee-cli-deal-payment-delete-test-${Date.now()}`);
const network = createNetwork();

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

describe("deal payment delete command", () => {
  test("provides a dry-run request", async () => {
    const result = await cli(
      ["--company-id", "123", "--id", "42", "--payment-id", "7", "--dry-run"],
      dealPaymentDeleteCommand,
    );
    if (typeof result !== "string") throw new Error("expected string result");
    expect(JSON.parse(result).request.method).toBe("DELETE");
  });
});
