import { define } from "gunshi";

import { companyArgs } from "../../global-args.ts";
import { initCommand } from "../../helpers.ts";
import { getSections } from "../../types/freee/sdk.gen.ts";

export const sectionListCommand = define({
  name: "list",
  description: "List accounting sections (departments)",
  args: companyArgs,
  run: async (ctx) => {
    const { companyId } = initCommand(ctx);
    const { data } = await getSections({ query: { company_id: companyId } });
    return JSON.stringify(data.sections);
  },
});
