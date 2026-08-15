import { define } from "gunshi";

import { companyArgs } from "../../global-args.ts";
import { initCommand } from "../../helpers.ts";
import { formatOutput } from "../../output/formatter.ts";
import { getTaxesCompanies } from "../../types/freee/sdk.gen.ts";

export const taxCodeListCommand = define({
  name: "tax-code-list",
  description: "List tax codes",
  args: companyArgs,
  run: async (ctx) => {
    const { companyId, format } = initCommand(ctx);
    const { data } = await getTaxesCompanies({
      path: { company_id: companyId },
      query: { available: true },
    });
    return formatOutput(data.taxes, format);
  },
});
