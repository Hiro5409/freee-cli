import * as v from "valibot";

import { CliError, errorHints } from "./errors.ts";

export const PositiveIntegerSchema = v.pipe(
  v.number("Expected a positive integer."),
  v.safeInteger("Expected a positive integer."),
  v.minValue(1, "Expected a positive integer."),
);

type CliInputContext = {
  label: string;
  why?: string;
  hint?: string;
};

export function parseCliInput<
  const TSchema extends v.BaseSchema<unknown, unknown, v.BaseIssue<unknown>>,
>(schema: TSchema, input: unknown, context: CliInputContext): v.InferOutput<TSchema> {
  const result = v.safeParse(schema, input);
  if (result.success) return result.output;

  throw new CliError(`${context.label} is invalid: ${v.summarize(result.issues)}`, {
    code: "INVALID_INPUT",
    why: context.why ?? "The value does not satisfy this command's input requirements.",
    hint: context.hint ?? errorHints.invalidValue,
  });
}
