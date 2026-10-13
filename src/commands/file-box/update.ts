import { define } from "gunshi";
import { args, choice, integer, merge, required, string } from "gunshi/combinators";
import colors from "yoctocolors";

import { isoDateArg } from "../../cli-input.ts";
import { CliError, errorHints } from "../../errors.ts";
import { dryRunArgs } from "../../global-args.ts";
import { initCommand } from "../../helpers.ts";
import { formatDryRun, formatValue } from "../../output/formatter.ts";
import { updateReceipt } from "../../types/freee/sdk.gen.ts";
import type { ReceiptUpdateParams } from "../../types/freee/types.gen.ts";

const DOCUMENT_TYPES = ["receipt", "invoice", "other"] as const;
const QUALIFIED_INVOICE_STATUSES = ["qualified", "not_qualified", "unselected"] as const;

export const fileBoxUpdateCommand = define({
  name: "file-box-update",
  description: "Update metadata for a document in the File Box",
  args: merge(
    dryRunArgs,
    args({
      id: required(
        integer({ min: 1, max: Number.MAX_SAFE_INTEGER, description: "File Box document ID" }),
      ),
      description: string({ description: "Memo" }),
      "partner-name": string({ description: "Issuer name" }),
      "issue-date": isoDateArg("--issue-date", "Issue date (YYYY-MM-DD)"),
      amount: integer({
        min: Number.MIN_SAFE_INTEGER,
        max: Number.MAX_SAFE_INTEGER,
        description: "Document amount (integer yen)",
      }),
      "document-type": choice(DOCUMENT_TYPES, {
        description: `Document type: ${DOCUMENT_TYPES.join(" | ")}`,
      }),
      "qualified-invoice": choice(QUALIFIED_INVOICE_STATUSES, {
        description: `Qualified invoice status: ${QUALIFIED_INVOICE_STATUSES.join(" | ")}`,
      }),
      "registration-number": string({
        description: "Qualified invoice issuer registration number",
      }),
    }),
  ),
  examples: `$ freee file-box-update --id 55 --description "Books" --document-type receipt \\
    --dry-run --format json`,
  run: async (ctx) => {
    const { companyId, format } = initCommand(ctx);
    const id = ctx.values.id;
    const hasMetadata =
      ctx.values["partner-name"] !== undefined ||
      ctx.values["issue-date"] !== undefined ||
      ctx.values.amount !== undefined;
    const hasChanges =
      ctx.values.description !== undefined ||
      hasMetadata ||
      ctx.values["document-type"] !== undefined ||
      ctx.values["qualified-invoice"] !== undefined ||
      ctx.values["registration-number"] !== undefined;
    const body: ReceiptUpdateParams = {
      company_id: companyId,
      description: ctx.values.description,
      receipt_metadatum: hasMetadata
        ? {
            partner_name: ctx.values["partner-name"],
            issue_date: ctx.values["issue-date"],
            amount: ctx.values.amount,
          }
        : undefined,
      document_type: ctx.values["document-type"],
      qualified_invoice: ctx.values["qualified-invoice"],
      invoice_registration_number: ctx.values["registration-number"],
    };
    if (!hasChanges) {
      throw new CliError("Pass at least one File Box document field to update.", {
        code: "INVALID_INPUT",
        why: "A File Box document update with no changed fields has no effect.",
        hint: errorHints.invalidValue,
      });
    }
    const path = `/api/1/receipts/${id}`;

    if (ctx.values["dry-run"]) {
      return formatDryRun(
        format,
        { method: "PUT", path, body },
        `${colors.yellow("Dry run —")} would update File Box document ${id}.`,
      );
    }

    const { data } = await updateReceipt({ path: { id }, body });
    return formatValue(
      data.receipt,
      format,
      `${colors.green("File Box document updated:")} ${JSON.stringify(data.receipt, null, 2)}`,
    );
  },
});
