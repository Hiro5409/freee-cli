import * as z from "zod/mini";

import { CliError, errorHints } from "../../errors.ts";
import type { TransferParams } from "../../types/freee/types.gen.ts";

type Destination = NonNullable<TransferParams["to_walletables"]>[number];

const PositiveInteger = z.number().check(z.int(), z.positive());
const DestinationSchema = z.strictObject({
  type: z.enum(["bank_account", "credit_card", "wallet"]),
  id: PositiveInteger,
  amount: PositiveInteger,
  description: z.optional(z.string()),
});

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
    let json: unknown;
    try {
      json = JSON.parse(value);
    } catch {
      throw new CliError(`${label} is not valid JSON: ${value}`, {
        code: "INVALID_INPUT",
        why: "Each --to takes one destination object.",
        hint: errorHints.invalidValue,
      });
    }
    const result = DestinationSchema.safeParse(json);
    if (!result.success) {
      throw new CliError(`${label} is invalid: ${z.prettifyError(result.error)}`, {
        code: "INVALID_INPUT",
        why: "A destination needs a walletable type, positive ID, and positive integer amount.",
        hint: errorHints.invalidValue,
      });
    }
    return result.data;
  });
}
