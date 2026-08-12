import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { cli } from "gunshi";
import { setupServer } from "msw/node";

import { hrPayrollListCommand } from "../../src/commands/hr/payroll-list.ts";
import { saveCredentials } from "../../src/config/credentials.ts";
import {
  handleGetSalariesEmployeePayrollStatement,
  handleGetSalariesEmployeePayrollStatements,
} from "../../src/types/freee-hr/msw.gen.ts";
import { MOCK_TOKEN } from "../fixtures.ts";

const testDir = join(tmpdir(), `freee-cli-hr-payroll-list-test-${Date.now()}`);

const statement = {
  id: 100,
  company_id: 123,
  employee_id: 42,
  employee_name: "山田 太郎",
  employee_display_name: "山田 太郎",
  employee_num: "A-001",
  pay_date: "2026-08-25",
  fixed: true,
  calc_status: "calculated",
  gross_payment_amount: "45000.0",
  total_deduction_amount: "12000.0",
  net_payment_amount: "33000.0",
  total_transfer_amount: "33000.0",
  deductions: [{ name: "社会保険料", amount: "12000.0" }],
};

const server = setupServer(
  handleGetSalariesEmployeePayrollStatements({
    body: { employee_payroll_statements: [statement], total_count: 1 },
  }),
  handleGetSalariesEmployeePayrollStatement({
    body: { employee_payroll_statement: statement },
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

describe("HR payroll list command", () => {
  test("lists payroll statements for the requested payment month", async () => {
    server.use(
      handleGetSalariesEmployeePayrollStatements(async ({ request }) => {
        const url = new URL(request.url);
        expect(url.searchParams.get("company_id")).toBe("123");
        expect(url.searchParams.get("year")).toBe("2026");
        expect(url.searchParams.get("month")).toBe("8");
        expect(url.searchParams.get("offset")).toBe("0");
        expect(url.searchParams.get("limit")).toBe("100");
        return Response.json({ employee_payroll_statements: [statement], total_count: 1 });
      }),
    );

    const result = await cli(
      ["--company-id", "123", "--format", "json", "--month", "2026-08"],
      hrPayrollListCommand,
    );

    if (typeof result !== "string") throw new Error("expected string result");
    expect(JSON.parse(result)).toEqual([statement]);
  });

  test("uses the employee detail endpoint when employee ID is specified", async () => {
    let listCalled = false;
    server.use(
      handleGetSalariesEmployeePayrollStatements(() => {
        listCalled = true;
        return Response.json({ employee_payroll_statements: [], total_count: 0 });
      }),
      handleGetSalariesEmployeePayrollStatement(async ({ request, params }) => {
        const url = new URL(request.url);
        expect(params.employee_id).toBe("42");
        expect(url.searchParams.get("company_id")).toBe("123");
        expect(url.searchParams.get("year")).toBe("2026");
        expect(url.searchParams.get("month")).toBe("8");
        return Response.json({ employee_payroll_statement: statement });
      }),
    );

    const result = await cli(
      ["--company-id", "123", "--format", "json", "--month", "2026-08", "--employee-id", "42"],
      hrPayrollListCommand,
    );

    if (typeof result !== "string") throw new Error("expected string result");
    expect(JSON.parse(result)).toEqual([statement]);
    expect(listCalled).toBe(false);
  });

  test("table output shows payment totals without deduction details", async () => {
    const result = await cli(["--company-id", "123", "--month", "2026-08"], hrPayrollListCommand);

    if (typeof result !== "string") throw new Error("expected string result");
    expect(result).toContain("gross_payment_amount");
    expect(result).toContain("45000.0");
    expect(result).toContain("33000.0");
    expect(result).not.toContain("社会保険料");
  });

  test("rejects an invalid employee ID before calling the API", async () => {
    let called = false;
    server.use(
      handleGetSalariesEmployeePayrollStatement(() => {
        called = true;
        return Response.json({ employee_payroll_statement: statement });
      }),
    );

    await expect(
      cli(
        ["--company-id", "123", "--month", "2026-08", "--employee-id", "0"],
        hrPayrollListCommand,
      ),
    ).rejects.toThrow(/positive integer/);
    expect(called).toBe(false);
  });
});
