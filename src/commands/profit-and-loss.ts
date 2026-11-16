import { define } from "gunshi";
import { args, merge } from "gunshi/combinators";

import { yearArg } from "../cli-input.ts";
import { companyArgs } from "../global-args.ts";
import { initCommand } from "../helpers.ts";
import { getTrialPl } from "../types/freee/sdk.gen.ts";

export const profitAndLossCommand = define({
  name: "show",
  description: "Show a profit and loss statement",
  args: merge(
    companyArgs,
    args({ "fiscal-year": yearArg("--fiscal-year", "Fiscal year (e.g. 2025)") }),
  ),
  run: async (ctx) => {
    const { companyId } = initCommand(ctx);
    const { data } = await getTrialPl({
      query: {
        company_id: companyId,
        fiscal_year: ctx.values["fiscal-year"],
      },
    });
    return JSON.stringify(data.trial_pl.balances);
  },
});
