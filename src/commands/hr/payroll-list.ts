import { define } from "gunshi";
import { args, integer, merge, required } from "gunshi/combinators";

import { fetchAll } from "../../api/paginate.ts";
import { monthArg } from "../../cli-input.ts";
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
  args: merge(
    listArgs,
    args({
      month: required(monthArg("--month", "Payment month (YYYY-MM)")),
      "employee-id": integer({
        min: 1,
        max: Number.MAX_SAFE_INTEGER,
        description: "Return the statement for one employee ID",
      }),
    }),
  ),
  run: async (ctx) => {
    const { companyId, format } = initCommand(ctx);
    const { year, month } = ctx.values.month;
    const limit = ctx.values.limit;

    const employeeId = ctx.values["employee-id"];
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
