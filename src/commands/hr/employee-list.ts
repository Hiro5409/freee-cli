import { define } from "gunshi";
import { args, merge, required } from "gunshi/combinators";

import { fetchAll } from "../../api/paginate.ts";
import { monthArg } from "../../cli-input.ts";
import { listArgs } from "../../global-args.ts";
import { initCommand } from "../../helpers.ts";
import { formatOutput } from "../../output/formatter.ts";
import { getEmployees } from "../../types/freee-hr/sdk.gen.ts";

export const hrEmployeeListCommand = define({
  name: "hr-employee-list",
  description: "List employees from the freee HR API for a payroll month",
  args: merge(listArgs, args({ month: required(monthArg("--month", "Payroll month (YYYY-MM)")) })),
  run: async (ctx) => {
    const { companyId, format } = initCommand(ctx);
    const { year, month } = ctx.values.month;

    const employees = await fetchAll(async (offset, limit) => {
      const { data } = await getEmployees({
        query: { company_id: companyId, year, month, offset, limit },
      });
      return data.employees ?? [];
    }, ctx.values.limit);

    const output =
      format === "json"
        ? employees
        : employees.map((employee) => ({
            id: employee.id,
            num: employee.num,
            display_name: employee.display_name,
            entry_date: employee.entry_date,
            retire_date: employee.retire_date,
            payroll_calculation: employee.payroll_calculation,
            payment_schedule: employee.company_reference_date_rule_name,
          }));

    return formatOutput(output, format);
  },
});
