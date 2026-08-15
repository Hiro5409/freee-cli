import { define } from "gunshi";

import { fetchAll } from "../../api/paginate.ts";
import { listArgs } from "../../global-args.ts";
import { initCommand, parseLimit } from "../../helpers.ts";
import { formatOutput } from "../../output/formatter.ts";
import { getPartners } from "../../types/freee/sdk.gen.ts";

export const partnerListCommand = define({
  name: "partner-list",
  description: "List partners (transaction counterparts)",
  args: {
    ...listArgs,
    keyword: { type: "string" as const, description: "Search keyword" },
  },
  run: async (ctx) => {
    const { companyId, format } = initCommand(ctx);

    const partners = await fetchAll(async (offset, limit) => {
      const { data } = await getPartners({
        query: { company_id: companyId, offset, limit, keyword: ctx.values.keyword },
      });
      return data.partners;
    }, parseLimit(ctx.values.limit));

    return formatOutput(partners, format);
  },
});
