import { define } from "gunshi";
import { args, merge, string } from "gunshi/combinators";

import { fetchAll } from "../../api/paginate.ts";
import { listArgs } from "../../global-args.ts";
import { initCommand } from "../../helpers.ts";
import { getPartners } from "../../types/freee/sdk.gen.ts";

export const partnerListCommand = define({
  name: "list",
  description: "List partners (transaction counterparts)",
  args: merge(listArgs, args({ keyword: string({ description: "Search keyword" }) })),
  run: async (ctx) => {
    const { companyId } = initCommand(ctx);

    const partners = await fetchAll(async (offset, limit) => {
      const { data } = await getPartners({
        query: { company_id: companyId, offset, limit, keyword: ctx.values.keyword },
      });
      return data.partners;
    }, ctx.values.limit);

    return JSON.stringify(partners);
  },
});
