import { define } from "gunshi";

import { companyArgs } from "../../global-args.ts";
import { initCommand } from "../../helpers.ts";
import { formatOutput } from "../../output/formatter.ts";
import { quotationsTemplatesIndex } from "../../types/freee-invoice/sdk.gen.ts";

export const quotationTemplateListCommand = define({
  name: "list",
  description: "List available quotation templates",
  args: companyArgs,
  examples: "$ freee quotation-template list --format json",
  run: async (ctx) => {
    const { companyId, format } = initCommand(ctx);
    const { data } = await quotationsTemplatesIndex({ query: { company_id: companyId } });
    return formatOutput(data.templates, format);
  },
});
