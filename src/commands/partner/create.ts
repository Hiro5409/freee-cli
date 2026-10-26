import { define } from "gunshi";
import { args, merge, required, string } from "gunshi/combinators";
import colors from "yoctocolors";

import { companyArgs } from "../../global-args.ts";
import { initCommand } from "../../helpers.ts";
import { formatValue } from "../../output/formatter.ts";
import { createPartner } from "../../types/freee/sdk.gen.ts";
import type { PartnerCreateParams } from "../../types/freee/types.gen.ts";

export const partnerCreateCommand = define({
  name: "create",
  description: "Create a partner (transaction counterpart)",
  args: merge(
    companyArgs,
    args({
      name: required(string({ maxLength: 255, description: "Partner name" })),
      code: string({ description: "Partner code" }),
    }),
  ),
  examples: `$ freee partner create --name "Acme" --code P-001 --format json`,
  run: async (ctx) => {
    const { companyId, format } = initCommand(ctx);
    const body: PartnerCreateParams = {
      company_id: companyId,
      name: ctx.values.name,
      ...(ctx.values.code === undefined ? {} : { code: ctx.values.code }),
    };

    const { data } = await createPartner({ body });
    return formatValue(
      data.partner,
      format,
      `${colors.green("Partner created:")} ${JSON.stringify(data.partner, null, 2)}`,
    );
  },
});
