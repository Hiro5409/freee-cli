import { describe, expect, test } from "bun:test";

import {
  IsoDateSchema,
  MonthTextSchema,
  parseCliInput,
  PositiveIntegerTextSchema,
  YearTextSchema,
} from "./cli-input.ts";
import { CliError } from "./errors.ts";

describe("CLI scalar schemas", () => {
  test("parses positive integer strings without coercing other syntax", () => {
    expect(parseCliInput(PositiveIntegerTextSchema, "1", { label: "--id" })).toBe(1);
    for (const value of ["0", "1.5", "1e3", "abc", String(Number.MAX_SAFE_INTEGER + 1)]) {
      expect(() => parseCliInput(PositiveIntegerTextSchema, value, { label: "--id" })).toThrow(
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
