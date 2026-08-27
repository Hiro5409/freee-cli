import { define } from "gunshi";

import { fetchAll } from "../../api/paginate.ts";
import {
  MonthTextSchema,
  OptionalLimitTextSchema,
  PositiveIntegerTextSchema,
  parseCliInput,
} from "../../cli-input.ts";
import { listArgs } from "../../global-args.ts";
import { initCommand } from "../../helpers.ts";
import { formatOutput } from "../../output/formatter.ts";
import {
  getSalariesEmployeePayrollStatement,
  getSalariesEmployeePayrollStatements,
} from "../../types/freee-hr/sdk.gen.ts";

export const hrPayrollListCommand = define({
  name: "hr-payroll-list",
  description: "List payroll statements from the freee HR API for a payment month",
  args: {
    ...listArgs,
    month: {
      type: "string" as const,
      description: "Payment month (YYYY-MM)",
      required: true,
    },
    "employee-id": {
      type: "string" as const,
      description: "Return the statement for one employee ID",
    },
  },
  run: async (ctx) => {
    const { companyId, format } = initCommand(ctx);
    const { year, month } = parseCliInput(MonthTextSchema, ctx.values.month, { label: "--month" });
    const limit = parseCliInput(OptionalLimitTextSchema, ctx.values.limit, { label: "--limit" });

    const employeeId = ctx.values["employee-id"]
      ? parseCliInput(PositiveIntegerTextSchema, ctx.values["employee-id"], {
          label: "--employee-id",
        })
      : undefined;
    const statements = employeeId
      ? await getSalariesEmployeePayrollStatement({
          path: { employee_id: employeeId },
          query: { company_id: companyId, year, month },
        }).then(({ data }) =>
          data.employee_payroll_statement ? [data.employee_payroll_statement] : [],
        )
      : await fetchAll(async (offset, pageSize) => {
          const { data } = await getSalariesEmployeePayrollStatements({
            query: { company_id: companyId, year, month, offset, limit: pageSize },
          });
          return data.employee_payroll_statements ?? [];
        }, limit);

    const output =
      format === "json"
        ? statements
        : statements.map((statement) => ({
            employee_id: statement.employee_id,
            employee_num: statement.employee_num,
            employee_name: statement.employee_display_name ?? statement.employee_name,
            pay_date: statement.pay_date,
            fixed: statement.fixed,
            calc_status: statement.calc_status,
            gross_payment_amount: statement.gross_payment_amount,
            total_deduction_amount: statement.total_deduction_amount,
            net_payment_amount: statement.net_payment_amount,
            total_transfer_amount: statement.total_transfer_amount,
          }));

    return formatOutput(output, format);
  },
});
