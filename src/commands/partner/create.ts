import { define } from "gunshi";
import colors from "yoctocolors";

import { CliError } from "../../errors.ts";
import { writeArgs } from "../../global-args.ts";
import { initCommand } from "../../helpers.ts";
import { formatDryRun, formatValue } from "../../output/formatter.ts";
import { createPartner } from "../../types/freee/sdk.gen.ts";
import type { PartnerCreateParams } from "../../types/freee/types.gen.ts";

function parsePartnerName(value: unknown): string {
  const name = String(value);
  if (name.length > 255) {
    throw new CliError(`--name must be 255 characters or fewer, got ${name.length}`, {
      code: "INVALID_INPUT",
    });
  }
  return name;
}

export const partnerCreateCommand = define({
  name: "partner-create",
  description: "Create a partner (transaction counterpart)",
  args: {
    ...writeArgs,
    name: { type: "string" as const, description: "Partner name", required: true },
    code: { type: "string" as const, description: "Partner code" },
  },
  examples: `# Preview the request before writing
$ freee partner-create --name "Acme" --code P-001 --dry-run --format json`,
  run: async (ctx) => {
    const { companyId, format } = initCommand(ctx);
    const body: PartnerCreateParams = {
      company_id: companyId,
      name: parsePartnerName(ctx.values.name),
      ...(ctx.values.code === undefined ? {} : { code: ctx.values.code }),
    };

    if (ctx.values["dry-run"]) {
      return formatDryRun(
        format,
        { method: "POST", path: "/api/1/partners", body },
        `${colors.yellow("Dry run —")} would create partner: ${JSON.stringify(body, null, 2)}`,
      );
    }

    const { data } = await createPartner({ body });
    return formatValue(
      data.partner,
      format,
      `${colors.green("Partner created:")} ${JSON.stringify(data.partner, null, 2)}`,
    );
  },
});
