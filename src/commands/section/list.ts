import { define } from "gunshi";

import { companyArgs } from "../../global-args.ts";
import { initCommand } from "../../helpers.ts";
import { formatOutput } from "../../output/formatter.ts";
import { getSections } from "../../types/freee/sdk.gen.ts";

export const sectionListCommand = define({
  name: "section-list",
  description: "List accounting sections (departments)",
  args: companyArgs,
  run: async (ctx) => {
    const { companyId, format } = initCommand(ctx);
    const { data } = await getSections({ query: { company_id: companyId } });
    return formatOutput(data.sections, format);
  },
});
