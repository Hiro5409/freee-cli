import { define } from "gunshi";

import { fetchAll } from "../../api/paginate.ts";
import { companyArgs } from "../../global-args.ts";
import { initCommand } from "../../helpers.ts";
import { formatOutput } from "../../output/formatter.ts";
import { getItems } from "../../types/freee/sdk.gen.ts";

export const itemListCommand = define({
  name: "item-list",
  description: "List items (products/services)",
  args: companyArgs,
  run: async (ctx) => {
    const { companyId, format } = initCommand(ctx);

    const items = await fetchAll(async (offset, limit) => {
      const { data } = await getItems({
        query: { company_id: companyId, offset, limit },
      });
      return data.items;
    });

    return formatOutput(items, format);
  },
});
