import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, readFileSync, rmSync, truncateSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { cli } from "gunshi";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";

import { MOCK_TOKEN } from "../../../test/credentials.ts";
import { saveCredentials } from "../../config/credentials.ts";
import { handleDestroyReceipt, handleUpdateReceipt } from "../../types/freee/msw.gen.ts";
import { fileBoxDeleteCommand } from "./delete.ts";
import { fileBoxDownloadCommand } from "./download.ts";
import { fileBoxUpdateCommand } from "./update.ts";
import { fileBoxUploadCommand } from "./upload.ts";

const testDir = join(tmpdir(), `freee-cli-file-box-mutations-test-${Date.now()}`);
const server = setupServer(
  http.get("https://api.freee.co.jp/api/1/receipts/55/download", () =>
    HttpResponse.arrayBuffer(new TextEncoder().encode("receipt-bytes").buffer, {
      headers: { "Content-Type": "application/pdf" },
    }),
  ),
  handleUpdateReceipt({
    body: {
      receipt: {
        id: 55,
        status: "confirmed",
        origin: "public_api",
        description: "書籍",
        mime_type: "application/pdf",
        created_at: "2026-08-13T10:00:00+09:00",
        user: { id: 1, email: "tester@example.com", display_name: "Tester" },
      },
    },
  }),
  handleDestroyReceipt(() => new HttpResponse(null, { status: 204 })),
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

describe("File Box commands", () => {
  test("accepts a regular file for upload", async () => {
    const file = join(testDir, "receipt.pdf");
    writeFileSync(file, "receipt");

    const result = await cli(
      ["--company-id", "123", "--file", file, "--dry-run", "--format", "json"],
      fileBoxUploadCommand,
    );

    expect(JSON.parse(String(result)).request.body.file).toBe(file);
  });

  test("rejects unreadable upload targets and files over the API limit", async () => {
    const missing = join(testDir, "missing.pdf");
    await expect(
      cli(["--company-id", "123", "--file", missing, "--dry-run"], fileBoxUploadCommand),
    ).rejects.toThrow();
    await expect(
      cli(["--company-id", "123", "--file", testDir, "--dry-run"], fileBoxUploadCommand),
    ).rejects.toThrow("not a regular file");

    const large = join(testDir, "large.pdf");
    writeFileSync(large, "");
    truncateSync(large, 64 * 1024 * 1024 + 1);
    await expect(
      cli(["--company-id", "123", "--file", large, "--dry-run"], fileBoxUploadCommand),
    ).rejects.toThrow("64 MB");
  });

  test("downloads binary File Box document data to an explicit new path", async () => {
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

  test("updates File Box document metadata", async () => {
    const result = await cli(
      [
        "--company-id",
        "123",
        "--id",
        "55",
        "--description",
        "書籍",
        "--document-type",
        "receipt",
        "--dry-run",
        "--format",
        "json",
      ],
      fileBoxUpdateCommand,
    );
    if (typeof result !== "string") throw new Error("expected string result");
    expect(JSON.parse(result).request.body).toEqual({
      company_id: 123,
      description: "書籍",
      document_type: "receipt",
    });
  });

  test("deletes a File Box document", async () => {
    const result = await cli(
      ["--company-id", "123", "--id", "55", "--format", "json"],
      fileBoxDeleteCommand,
    );
    expect(existsSync(join(testDir, "receipt.pdf"))).toBe(false);
    if (typeof result !== "string") throw new Error("expected string result");
    expect(JSON.parse(result)).toEqual({ id: 55, deleted: true });
  });
});
