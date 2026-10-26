import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { cli } from "gunshi";
import { HttpResponse } from "msw/http";

import { MOCK_TOKEN } from "../../../test/credentials.ts";
import { createNetwork } from "../../../test/network.ts";
import { saveCredentials } from "../../config/credentials.ts";
import { handleGetReceipt } from "../../types/freee/msw.gen.ts";
import { fileBoxShowCommand } from "./show.ts";

const testDir = join(tmpdir(), `freee-cli-file-box-show-test-${Date.now()}`);

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

describe("File Box show command", () => {
  test("会計APIのファイルボックス証憑をID指定で取得し、JSONで出力する", async () => {
    let requestedUrl = "";
    network.use(
      handleGetReceipt(({ request, params }) => {
        requestedUrl = request.url;
        return HttpResponse.json({
          receipt: {
            id: Number(params.id),
            status: "confirmed",
            description: "書籍",
            mime_type: "application/pdf",
            origin: "public_api",
            created_at: "2026-08-01T10:00:00+09:00",
            user: { id: 1, email: "tester@example.com", display_name: "Tester" },
          },
        });
      }),
    );

    const result = await cli(
      ["--company-id", "123", "--id", "55", "--format", "json"],
      fileBoxShowCommand,
    );

    const url = new URL(requestedUrl);
    expect(url.pathname).toBe("/api/1/receipts/55");
    expect(url.searchParams.get("company_id")).toBe("123");
    if (typeof result !== "string") throw new Error("expected string result");
    expect(JSON.parse(result)).toMatchObject({ id: 55, description: "書籍" });
  });
});
