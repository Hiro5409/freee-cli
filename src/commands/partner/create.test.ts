import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, mock, test } from "bun:test";
import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { cli } from "gunshi";
import { HttpResponse } from "msw";
import { setupServer } from "msw/node";

import { MOCK_TOKEN } from "../../../test/credentials.ts";
import { saveCredentials } from "../../config/credentials.ts";
import { handleCreatePartner } from "../../types/freee/msw.gen.ts";
import { partnerCreateCommand } from "./create.ts";

const testDir = join(tmpdir(), `freee-cli-partner-create-test-${Date.now()}`);
const onCreatePartner = mock();

const server = setupServer(
  handleCreatePartner(async ({ request }) => {
    const body = await request.json();
    onCreatePartner(body);
    return HttpResponse.json(
      {
        partner: {
          id: 42,
          code: body.code ?? null,
          company_id: body.company_id,
          name: body.name,
          update_date: "2026-08-13",
          available: true,
        },
      },
      { status: 201 },
    );
  }),
);

beforeAll(() =>
  server.listen({
    onUnhandledRequest(request, print) {
      if (new URL(request.url).hostname === "accounts.secure.freee.co.jp") return;
      print.error();
    },
  }),
);
afterAll(() => server.close());

beforeEach(() => {
  onCreatePartner.mockClear();
  mkdirSync(testDir, { recursive: true });
  saveCredentials(testDir, { default: MOCK_TOKEN });
  process.env.FREEE_CLI_CONFIG_DIR = testDir;
});

afterEach(() => {
  server.resetHandlers();
  delete process.env.FREEE_CLI_CONFIG_DIR;
  rmSync(testDir, { recursive: true, force: true });
});

describe("partner create command", () => {
  test("creates a partner and returns the API response as JSON", async () => {
    const result = await cli(
      ["--company-id", "123", "--name", "Acme", "--code", "P-001", "--format", "json"],
      partnerCreateCommand,
    );

    expect(onCreatePartner).toHaveBeenCalledWith({ company_id: 123, name: "Acme", code: "P-001" });
    if (typeof result !== "string") throw new Error("expected string result");
    expect(JSON.parse(result)).toEqual(
      expect.objectContaining({ id: 42, code: "P-001", name: "Acme" }),
    );
  });

  test("omits code when it is not provided", async () => {
    await cli(["--company-id", "123", "--name", "Acme"], partnerCreateCommand);

    expect(onCreatePartner).toHaveBeenCalledWith({ company_id: 123, name: "Acme" });
  });

  test("rejects a name over the API limit before calling the API", async () => {
    await expect(
      cli(["--company-id", "123", "--name", "a".repeat(256)], partnerCreateCommand),
    ).rejects.toThrow(/255/);
    expect(onCreatePartner).not.toHaveBeenCalled();
  });
});
