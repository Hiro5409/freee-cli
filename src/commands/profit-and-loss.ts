import { define } from "gunshi";

import { companyArgs } from "../global-args.ts";
import { initCommand, parseYear } from "../helpers.ts";
import { formatOutput } from "../output/formatter.ts";
import { getTrialPl } from "../types/freee/sdk.gen.ts";

export const profitAndLossCommand = define({
  name: "pl",
  description: "Show a profit and loss statement",
  args: {
    ...companyArgs,
    "fiscal-year": { type: "string" as const, description: "Fiscal year (e.g. 2025)" },
  },
  run: async (ctx) => {
    const { companyId, format } = initCommand(ctx);
    const { data } = await getTrialPl({
      query: {
        company_id: companyId,
        fiscal_year: ctx.values["fiscal-year"]
          ? parseYear(ctx.values["fiscal-year"], "--fiscal-year")
          : undefined,
      },
    });
    return formatOutput(data.trial_pl.balances, format);
  },
});
