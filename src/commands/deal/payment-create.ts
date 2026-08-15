import { define } from "gunshi";
import colors from "yoctocolors";

import { dealPaymentArgs, parseDealPayment } from "../../deal-payment.ts";
import { writeArgs } from "../../global-args.ts";
import { initCommand, parsePositiveId } from "../../helpers.ts";
import { formatDryRun, formatValue } from "../../output/formatter.ts";
import { createDealPayment } from "../../types/freee/sdk.gen.ts";

export const dealPaymentCreateCommand = define({
  name: "deal-payment-create",
  description: "Add a payment to an existing deal",
  args: {
    ...writeArgs,
    id: { type: "string" as const, description: "Deal ID", required: true },
    ...dealPaymentArgs,
  },
  examples: `$ freee deal-payment-create --id 42 --date 2026-08-15 --amount 5000 \\
    --walletable-type bank_account --walletable-id 9 --dry-run --format json`,
  run: async (ctx) => {
    const { companyId, format } = initCommand(ctx);
    const id = parsePositiveId(ctx.values.id, "--id");
    const body = parseDealPayment(ctx.values, companyId);
    const path = `/api/1/deals/${id}/payments`;

    if (ctx.values["dry-run"]) {
      return formatDryRun(
        format,
        { method: "POST", path, body },
        `${colors.yellow("Dry run —")} would POST ${path}: ${JSON.stringify(body, null, 2)}`,
      );
    }

    const { data } = await createDealPayment({ path: { id }, body });
    return formatValue(
      data.deal,
      format,
      `${colors.green("Payment created:")} ${JSON.stringify(data.deal, null, 2)}`,
    );
  },
});
