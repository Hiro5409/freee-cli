import { define } from "gunshi";

import { companyArgs } from "../global-args.ts";
import { initCommand, parseNumber } from "../helpers.ts";
import { formatOutput } from "../output/formatter.ts";
import { getTrialBs } from "../types/freee/sdk.gen.ts";

export const bsCommand = define({
  name: "bs",
  description: "Show balance sheet (trial BS)",
  args: {
    ...companyArgs,
    "fiscal-year": { type: "string" as const, description: "Fiscal year (e.g. 2025)" },
  },
  run: async (ctx) => {
    const { companyId, format } = initCommand(ctx);
    const { data } = await getTrialBs({
      query: {
        company_id: companyId,
        fiscal_year: ctx.values["fiscal-year"]
          ? parseNumber(ctx.values["fiscal-year"], "--fiscal-year")
          : undefined,
      },
    });
    return formatOutput(data.trial_bs.balances, format);
  },
});
