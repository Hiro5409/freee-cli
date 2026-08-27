import { define } from "gunshi";

import { PositiveIntegerTextSchema, parseCliInput } from "../../cli-input.ts";
import { companyArgs } from "../../global-args.ts";
import { initCommand } from "../../helpers.ts";
import { formatResource } from "../../output/formatter.ts";
import { getDeal } from "../../types/freee/sdk.gen.ts";

export const dealShowCommand = define({
  name: "deal-show",
  description: "Show deal details",
  args: {
    ...companyArgs,
    id: { type: "string" as const, description: "Deal ID", required: true },
  },
  run: async (ctx) => {
    const { companyId, format } = initCommand(ctx);
    const { data } = await getDeal({
      path: { id: parseCliInput(PositiveIntegerTextSchema, ctx.values.id, { label: "--id" }) },
      query: { company_id: companyId },
    });
    return formatResource(data.deal, format);
  },
});
