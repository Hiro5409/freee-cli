import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { cli } from "gunshi";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";

import { MOCK_TOKEN } from "../../../test/credentials.ts";
import { saveCredentials } from "../../config/credentials.ts";
import { fileBoxDownloadCommand } from "./download.ts";

const testDir = join(tmpdir(), `freee-cli-file-box-download-test-${Date.now()}`);
const server = setupServer(
  http.get("https://api.freee.co.jp/api/1/receipts/55/download", () =>
    HttpResponse.arrayBuffer(new TextEncoder().encode("receipt-bytes").buffer, {
      headers: { "Content-Type": "application/pdf" },
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

describe("File Box download command", () => {
  test("downloads binary document data to an explicit new path", async () => {
    const output = join(testDir, "receipt.pdf");
    const result = await cli(
      ["--company-id", "123", "--id", "55", "--output", output, "--format", "json"],
      fileBoxDownloadCommand,
    );
    expect(readFileSync(output, "utf8")).toBe("receipt-bytes");
    if (typeof result !== "string") throw new Error("expected string result");
    expect(JSON.parse(result)).toMatchObject({ id: 55, path: output, mimeType: "application/pdf" });
  });

  test("refuses to overwrite a download target", async () => {
    const output = join(testDir, "existing.pdf");
    writeFileSync(output, "keep");
    await expect(
      cli(["--company-id", "123", "--id", "55", "--output", output], fileBoxDownloadCommand),
    ).rejects.toThrow(/already exists/);
    expect(readFileSync(output, "utf8")).toBe("keep");
  });
});
