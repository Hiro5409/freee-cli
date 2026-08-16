import { define } from "gunshi";

import { fetchAll } from "../../api/paginate.ts";
import { listArgs } from "../../global-args.ts";
import { initCommand, parseLimit } from "../../helpers.ts";
import { formatOutput } from "../../output/formatter.ts";
import { getTags } from "../../types/freee/sdk.gen.ts";

export const tagListCommand = define({
  name: "tag-list",
  description: "List accounting memo tags",
  args: listArgs,
  run: async (ctx) => {
    const { companyId, format } = initCommand(ctx);
    const tags = await fetchAll(async (offset, limit) => {
      const { data } = await getTags({ query: { company_id: companyId, offset, limit } });
      return data.tags;
    }, parseLimit(ctx.values.limit));
    return formatOutput(tags, format);
  },
});
