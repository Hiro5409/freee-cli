import { define } from "gunshi";

import { companyArgs } from "../../global-args.ts";
import { initCommand } from "../../helpers.ts";
import { invoicesTemplatesIndex } from "../../types/freee-invoice/sdk.gen.ts";

export const invoiceTemplateListCommand = define({
  name: "list",
  description: "List available invoice templates",
  args: companyArgs,
  run: async (ctx) => {
    const { companyId } = initCommand(ctx);
    const { data } = await invoicesTemplatesIndex({ query: { company_id: companyId } });
    return JSON.stringify(data.templates);
  },
});
