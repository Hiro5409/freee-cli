import { define } from "gunshi";

import { companyArgs } from "../global-args.ts";
import { initCommand, parseNumber } from "../helpers.ts";
import { formatOutput } from "../output/formatter.ts";
import { getTrialPl } from "../types/freee/sdk.gen.ts";

export const plCommand = define({
  name: "pl",
  description: "Show profit & loss statement (trial PL)",
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
          ? parseNumber(ctx.values["fiscal-year"], "--fiscal-year")
          : undefined,
      },
    });
    return formatOutput(data.trial_pl.balances, format);
  },
});
