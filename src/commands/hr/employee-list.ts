import { define } from "gunshi";
import { args, boolean, merge, required, withDefault } from "gunshi/combinators";

import { fetchAll } from "../../api/paginate.ts";
import { monthArg } from "../../cli-input.ts";
import { listArgs } from "../../global-args.ts";
import { initCommand } from "../../helpers.ts";
import { getEmployees } from "../../types/freee-hr/sdk.gen.ts";

export const hrEmployeeListCommand = define({
  name: "list",
  description:
    "List employees from the freee HR API for a payroll month, without sensitive personal data by default",
  args: merge(
    listArgs,
    args({
      month: required(monthArg("--month", "Payroll month (YYYY-MM)")),
      "all-fields": withDefault(
        boolean({
          description:
            "Return full API records, including sensitive personal data such as basic pension numbers",
        }),
        false,
      ),
    }),
  ),
  run: async (ctx) => {
    const { companyId } = initCommand(ctx);
    const { year, month } = ctx.values.month;

    const employees = await fetchAll(async (offset, limit) => {
      const { data } = await getEmployees({
        query: { company_id: companyId, year, month, offset, limit },
      });
      return data.employees ?? [];
    }, ctx.values.limit);

    return JSON.stringify(
      ctx.values["all-fields"]
        ? employees
        : employees.map((employee) => ({
            id: employee.id,
            num: employee.num,
            display_name: employee.display_name,
            entry_date: employee.entry_date,
            retire_date: employee.retire_date,
            payroll_calculation: employee.payroll_calculation,
            company_reference_date_rule_name: employee.company_reference_date_rule_name,
          })),
    );
  },
});
