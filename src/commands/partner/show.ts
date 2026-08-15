import { define } from "gunshi";

import { companyArgs } from "../../global-args.ts";
import { initCommand, parsePositiveId } from "../../helpers.ts";
import { formatResource } from "../../output/formatter.ts";
import { getPartner } from "../../types/freee/sdk.gen.ts";

export const partnerShowCommand = define({
  name: "partner-show",
  description: "Show partner details",
  args: {
    ...companyArgs,
    id: { type: "string" as const, description: "Partner ID", required: true },
  },
  examples: `$ freee partner-show --id 42 --format json`,
  run: async (ctx) => {
    const { companyId, format } = initCommand(ctx);
    const { data } = await getPartner({
      path: { id: parsePositiveId(ctx.values.id, "--id") },
      query: { company_id: companyId },
    });
    return formatResource(data.partner, format);
  },
});
