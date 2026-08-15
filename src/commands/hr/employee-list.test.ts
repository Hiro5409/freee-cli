import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { cli } from "gunshi";
import { setupServer } from "msw/node";

import { MOCK_TOKEN } from "../../../test/credentials.ts";
import { saveCredentials } from "../../config/credentials.ts";
import { handleGetEmployees } from "../../types/freee-hr/msw.gen.ts";
import { hrEmployeeListCommand } from "./employee-list.ts";

const testDir = join(tmpdir(), `freee-cli-hr-employee-list-test-${Date.now()}`);

const server = setupServer(
  handleGetEmployees({
    body: {
      employees: [
        {
          id: 42,
          company_id: 123,
          num: "A-001",
          display_name: "山田 太郎",
          base_pension_num: "1234567890",
          entry_date: "2026-04-01",
          payroll_calculation: true,
          company_reference_date_rule_name: "月末締め翌月25日払い",
        },
      ],
      total_count: 1,
    },
  }),
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

describe("HR employee list command", () => {
  test("lists employees for the requested payroll month as JSON", async () => {
    server.use(
      handleGetEmployees(async ({ request }) => {
        const url = new URL(request.url);
        expect(url.searchParams.get("company_id")).toBe("123");
        expect(url.searchParams.get("year")).toBe("2026");
        expect(url.searchParams.get("month")).toBe("8");
        expect(url.searchParams.get("offset")).toBe("0");
        expect(url.searchParams.get("limit")).toBe("100");
        return Response.json({
          employees: [{ id: 42, display_name: "山田 太郎" }],
          total_count: 1,
        });
      }),
    );

    const result = await cli(
      ["--company-id", "123", "--format", "json", "--month", "2026-08"],
      hrEmployeeListCommand,
    );

    if (typeof result !== "string") throw new Error("expected string result");
    expect(JSON.parse(result)).toEqual([{ id: 42, display_name: "山田 太郎" }]);
  });

  test("table output omits sensitive employee fields", async () => {
    const result = await cli(["--company-id", "123", "--month", "2026-08"], hrEmployeeListCommand);

    if (typeof result !== "string") throw new Error("expected string result");
    expect(result).toContain("山田 太郎");
    expect(result).toContain("payment_schedule");
    expect(result).not.toContain("base_pension_num");
    expect(result).not.toContain("1234567890");
  });

  test("rejects an invalid payroll month before calling the API", async () => {
    let called = false;
    server.use(
      handleGetEmployees(() => {
        called = true;
        return Response.json({ employees: [], total_count: 0 });
      }),
    );

    await expect(
      cli(["--company-id", "123", "--month", "2026-13"], hrEmployeeListCommand),
    ).rejects.toThrow(/YYYY-MM/);
    expect(called).toBe(false);
  });
});
