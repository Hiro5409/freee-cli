import { define } from "gunshi";

import { companyArgs } from "../../global-args.ts";
import { initCommand } from "../../helpers.ts";
import { quotationsTemplatesIndex } from "../../types/freee-invoice/sdk.gen.ts";

export const quotationTemplateListCommand = define({
  name: "list",
  description: "List available quotation templates",
  args: companyArgs,
  examples: "$ freee quotation-template list",
  run: async (ctx) => {
    const { companyId } = initCommand(ctx);
    const { data } = await quotationsTemplatesIndex({ query: { company_id: companyId } });
    return JSON.stringify(data.templates);
  },
});
