import { define } from "gunshi";

import { companyArgs } from "../../global-args.ts";
import { initCommand } from "../../helpers.ts";
import { formatOutput } from "../../output/formatter.ts";
import { getTaxCodes } from "../../types/freee/sdk.gen.ts";

export const taxCodeListCommand = define({
  name: "tax-code-list",
  description: "List tax codes",
  args: companyArgs,
  run: async (ctx) => {
    const { format } = initCommand(ctx);
    const { data } = await getTaxCodes();
    return formatOutput(data.taxes, format);
  },
});
