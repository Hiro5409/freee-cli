import { define } from "gunshi";

import { fetchAll } from "../../api/paginate.ts";
import { MonthTextSchema, OptionalLimitTextSchema, parseCliInput } from "../../cli-input.ts";
import { listArgs } from "../../global-args.ts";
import { initCommand } from "../../helpers.ts";
import { formatOutput } from "../../output/formatter.ts";
import { getEmployees } from "../../types/freee-hr/sdk.gen.ts";

export const hrEmployeeListCommand = define({
  name: "hr-employee-list",
  description: "List employees from the freee HR API for a payroll month",
  args: {
    ...listArgs,
    month: {
      type: "string" as const,
      description: "Payroll month (YYYY-MM)",
      required: true,
    },
  },
  run: async (ctx) => {
    const { companyId, format } = initCommand(ctx);
    const { year, month } = parseCliInput(MonthTextSchema, ctx.values.month, { label: "--month" });

    const employees = await fetchAll(
      async (offset, limit) => {
        const { data } = await getEmployees({
          query: { company_id: companyId, year, month, offset, limit },
        });
        return data.employees ?? [];
      },
      parseCliInput(OptionalLimitTextSchema, ctx.values.limit, { label: "--limit" }),
    );

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
