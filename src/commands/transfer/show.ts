import { define } from "gunshi";

import { PositiveIntegerTextSchema, parseCliInput } from "../../cli-input.ts";
import { companyArgs } from "../../global-args.ts";
import { initCommand } from "../../helpers.ts";
import { formatResource } from "../../output/formatter.ts";
import { getTransfer } from "../../types/freee/sdk.gen.ts";

export const transferShowCommand = define({
  name: "transfer-show",
  description: "Show an account transfer",
  args: {
    ...companyArgs,
    id: { type: "string" as const, description: "Transfer ID", required: true },
  },
  examples: `$ freee transfer-show --id 42 --format json`,
  run: async (ctx) => {
    const { companyId, format } = initCommand(ctx);
    const { data } = await getTransfer({
      path: { id: parseCliInput(PositiveIntegerTextSchema, ctx.values.id, { label: "--id" }) },
      query: { company_id: companyId },
    });
    return formatResource(data.transfer, format);
  },
});
