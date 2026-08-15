import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, mock, test } from "bun:test";
import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { cli } from "gunshi";
import { HttpResponse } from "msw";
import { setupServer } from "msw/node";

import { MOCK_TOKEN } from "../../../test/credentials.ts";
import { saveCredentials } from "../../config/credentials.ts";
import { handleGetPartner } from "../../types/freee/msw.gen.ts";
import { partnerShowCommand } from "./show.ts";

const testDir = join(tmpdir(), `freee-cli-partner-show-test-${Date.now()}`);
const onGetPartner = mock();

const server = setupServer(
  handleGetPartner(({ request, params }) => {
    onGetPartner({ id: params.id, companyId: new URL(request.url).searchParams.get("company_id") });
    return HttpResponse.json({
      partner: {
        id: 42,
        code: "P-001",
        company_id: 123,
        name: "Acme",
        update_date: "2026-08-13",
        available: true,
      },
    });
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
  onGetPartner.mockClear();
  mkdirSync(testDir, { recursive: true });
  saveCredentials(testDir, { default: MOCK_TOKEN });
  process.env.FREEE_CLI_CONFIG_DIR = testDir;
});

afterEach(() => {
  server.resetHandlers();
  delete process.env.FREEE_CLI_CONFIG_DIR;
  rmSync(testDir, { recursive: true, force: true });
});

describe("partner show command", () => {
  test("fetches the partner by ID and outputs it as JSON", async () => {
    const result = await cli(
      ["--company-id", "123", "--id", "42", "--format", "json"],
      partnerShowCommand,
    );

    expect(onGetPartner).toHaveBeenCalledWith({ id: "42", companyId: "123" });
    if (typeof result !== "string") throw new Error("expected string result");
    expect(JSON.parse(result)).toEqual(
      expect.objectContaining({ id: 42, code: "P-001", name: "Acme" }),
    );
  });

  test("rejects a non-positive ID before calling the API", async () => {
    await expect(cli(["--company-id", "123", "--id", "0"], partnerShowCommand)).rejects.toThrow(
      /positive integer/,
    );
    expect(onGetPartner).not.toHaveBeenCalled();
  });
});
