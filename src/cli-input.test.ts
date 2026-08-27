import { describe, expect, test } from "bun:test";

import {
  IntegerTextSchema,
  IsoDateSchema,
  MonthTextSchema,
  NonNegativeIntegerTextSchema,
  PositiveIntegerSchema,
  PositiveIntegerTextSchema,
  YearTextSchema,
  parseCliInput,
} from "./cli-input.ts";
import { CliError } from "./errors.ts";

describe("parseCliInput", () => {
  test("turns schema issues into a structured CliError", () => {
    try {
      parseCliInput(PositiveIntegerTextSchema, "0", { label: "--id" });
      throw new Error("expected parsing to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(CliError);
      expect(error).toMatchObject({ code: "INVALID_INPUT" });
      expect((error as Error).message).toContain("--id");
    }
  });
});

describe("CLI scalar schemas", () => {
  test("parses safe integer strings without coercing other syntax", () => {
    expect(parseCliInput(IntegerTextSchema, "-5000", { label: "--amount" })).toBe(-5000);
    for (const value of ["1.5", "1e3", "abc", String(Number.MAX_SAFE_INTEGER + 1)]) {
      expect(() => parseCliInput(IntegerTextSchema, value, { label: "--amount" })).toThrow(
        CliError,
      );
    }
  });

  test("distinguishes positive and non-negative integers", () => {
    expect(parseCliInput(NonNegativeIntegerTextSchema, "0", { label: "--priority" })).toBe(0);
    expect(parseCliInput(PositiveIntegerTextSchema, "1", { label: "--id" })).toBe(1);
    expect(() => parseCliInput(PositiveIntegerTextSchema, "0", { label: "--id" })).toThrow(
      CliError,
    );
    expect(() =>
      parseCliInput(NonNegativeIntegerTextSchema, "-1", { label: "--priority" }),
    ).toThrow(CliError);
  });

  test("accepts an already numeric positive integer only when safe", () => {
    expect(parseCliInput(PositiveIntegerSchema, 42, { label: "--company-id" })).toBe(42);
    for (const value of [0, 1.5, Number.MAX_SAFE_INTEGER + 1, "42"]) {
      expect(() => parseCliInput(PositiveIntegerSchema, value, { label: "--company-id" })).toThrow(
        CliError,
      );
    }
  });

  test("validates real zero-padded calendar dates", () => {
    expect(parseCliInput(IsoDateSchema, "2024-02-29", { label: "--date" })).toBe("2024-02-29");
    for (const value of ["2026-02-30", "2026-13-01", "2026-8-1", "2026/08/01"]) {
      expect(() => parseCliInput(IsoDateSchema, value, { label: "--date" })).toThrow(CliError);
    }
  });

  test("transforms a valid month and year", () => {
    expect(parseCliInput(MonthTextSchema, "2026-08", { label: "--month" })).toEqual({
      year: 2026,
      month: 8,
    });
    expect(parseCliInput(YearTextSchema, "2026", { label: "--year" })).toBe(2026);
    expect(() => parseCliInput(MonthTextSchema, "2026-13", { label: "--month" })).toThrow(CliError);
    expect(() => parseCliInput(YearTextSchema, "26", { label: "--year" })).toThrow(CliError);
  });
});
