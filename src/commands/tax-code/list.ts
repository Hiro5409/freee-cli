import { define } from "gunshi";

import { companyArgs } from "../../global-args.ts";
import { initCommand } from "../../helpers.ts";
import { getTaxesCompanies } from "../../types/freee/sdk.gen.ts";

export const taxCodeListCommand = define({
  name: "list",
  description: "List tax codes",
  args: companyArgs,
  run: async (ctx) => {
    const { companyId } = initCommand(ctx);
    const { data } = await getTaxesCompanies({
      path: { company_id: companyId },
      query: { available: true },
    });
    return JSON.stringify(data.taxes);
  },
});
