import * as v from "valibot";

import { CliError, errorHints } from "./errors.ts";

const INTEGER_TEXT = /^-?\d+$/;
const ISO_DATE_TEXT = /^\d{4}-\d{2}-\d{2}$/;
const ISO_MONTH_TEXT = /^(\d{4})-(\d{2})$/;
const YEAR_TEXT = /^\d{4}$/;

function integerText(message: string) {
  return v.pipe(
    v.string(message),
    v.regex(INTEGER_TEXT, message),
    v.transform(Number),
    v.number(message),
    v.safeInteger(message),
  );
}

export const IntegerTextSchema = integerText("Expected an integer.");

export const PositiveIntegerTextSchema = v.pipe(
  integerText("Expected a positive integer."),
  v.minValue(1, "Expected a positive integer."),
);

export const NonNegativeIntegerTextSchema = v.pipe(
  integerText("Expected a non-negative integer."),
  v.minValue(0, "Expected a non-negative integer."),
);

export const PositiveIntegerSchema = v.pipe(
  v.number("Expected a positive integer."),
  v.safeInteger("Expected a positive integer."),
  v.minValue(1, "Expected a positive integer."),
);

const REAL_ISO_DATE_MESSAGE = "Expected a real date in YYYY-MM-DD format.";

export const IsoDateSchema = v.pipe(
  v.string(REAL_ISO_DATE_MESSAGE),
  v.check((text) => {
    if (!ISO_DATE_TEXT.test(text)) return false;
    const date = new Date(`${text}T00:00:00Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === text;
  }, REAL_ISO_DATE_MESSAGE),
);

const ISO_MONTH_MESSAGE = "Expected a valid month in YYYY-MM format (01 through 12).";

export const MonthTextSchema = v.pipe(
  v.string(ISO_MONTH_MESSAGE),
  v.check((text) => {
    const match = ISO_MONTH_TEXT.exec(text);
    if (!match) return false;
    const month = Number(match[2]);
    return month >= 1 && month <= 12;
  }, ISO_MONTH_MESSAGE),
  v.transform((text) => {
    return { year: Number(text.slice(0, 4)), month: Number(text.slice(5, 7)) };
  }),
);

export const YearTextSchema = v.pipe(
  v.string(),
  v.regex(YEAR_TEXT, "Expected a four-digit year."),
  v.transform(Number),
);

export const OptionalLimitTextSchema = v.optional(PositiveIntegerTextSchema);

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
