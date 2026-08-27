import * as v from "valibot";

import { PositiveIntegerSchema, parseCliInput } from "../../cli-input.ts";
import { CliError, errorHints } from "../../errors.ts";
import type { TransferParams } from "../../types/freee/types.gen.ts";

type Destination = NonNullable<TransferParams["to_walletables"]>[number];

const DestinationSchema = v.strictObject({
  type: v.picklist(["bank_account", "credit_card", "wallet"]),
  id: PositiveIntegerSchema,
  amount: PositiveIntegerSchema,
  description: v.optional(v.string()),
});
const DestinationArgumentSchema = v.pipe(
  v.string(),
  v.parseJson(undefined, "Expected valid JSON."),
  DestinationSchema,
);

export function parseTransferDestinations(values: string[]): Destination[] {
  if (values.length === 0) {
    throw new CliError("A transfer needs at least one --to destination.", {
      code: "INVALID_INPUT",
      why: "freee requires a non-empty to_walletables array.",
      hint: errorHints.invalidValue,
    });
  }
  return values.map((value, index) => {
    const label = `--to #${index + 1}`;
    return parseCliInput(DestinationArgumentSchema, value, {
      label,
      why: "A destination needs a walletable type, positive ID, and positive integer amount.",
    });
  });
}
