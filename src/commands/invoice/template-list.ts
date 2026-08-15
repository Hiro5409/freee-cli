import { define } from "gunshi";

import { companyArgs } from "../../global-args.ts";
import { initCommand } from "../../helpers.ts";
import { formatOutput } from "../../output/formatter.ts";
import { invoicesTemplatesIndex } from "../../types/freee-invoice/sdk.gen.ts";

export const invoiceTemplateListCommand = define({
  name: "invoice-template-list",
  description: "List available invoice templates",
  args: companyArgs,
  run: async (ctx) => {
    const { companyId, format } = initCommand(ctx);
    const { data } = await invoicesTemplatesIndex({ query: { company_id: companyId } });
    return formatOutput(data.templates, format);
  },
});
