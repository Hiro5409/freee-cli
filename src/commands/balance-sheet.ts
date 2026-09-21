import { define } from "gunshi";
import { args, merge } from "gunshi/combinators";

import { yearArg } from "../cli-input.ts";
import { companyArgs } from "../global-args.ts";
import { initCommand } from "../helpers.ts";
import { formatOutput } from "../output/formatter.ts";
import { getTrialBs } from "../types/freee/sdk.gen.ts";

export const balanceSheetCommand = define({
  name: "bs",
  description: "Show a balance sheet",
  args: merge(
    companyArgs,
    args({ "fiscal-year": yearArg("--fiscal-year", "Fiscal year (e.g. 2025)") }),
  ),
  run: async (ctx) => {
    const { companyId, format } = initCommand(ctx);
    const { data } = await getTrialBs({
      query: {
        company_id: companyId,
        fiscal_year: ctx.values["fiscal-year"],
      },
    });
    return formatOutput(data.trial_bs.balances, format);
  },
});
