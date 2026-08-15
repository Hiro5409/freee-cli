import { define } from "gunshi";

import { companyArgs } from "../../global-args.ts";
import { initCommand } from "../../helpers.ts";
import { formatOutput } from "../../output/formatter.ts";
import { getAccountItems } from "../../types/freee/sdk.gen.ts";

export const accountItemListCommand = define({
  name: "account-item-list",
  description: "List account items (chart of accounts)",
  args: {
    ...companyArgs,
    keyword: { type: "string" as const, description: "Search keyword (client-side filter)" },
  },
  run: async (ctx) => {
    const { companyId, format } = initCommand(ctx);
    const { data } = await getAccountItems({ query: { company_id: companyId } });
    let items = data.account_items;
    if (ctx.values.keyword) {
      const kw = ctx.values.keyword.toLowerCase();
      items = items.filter((a) => a.name.toLowerCase().includes(kw));
    }
    return formatOutput(items, format);
  },
});
