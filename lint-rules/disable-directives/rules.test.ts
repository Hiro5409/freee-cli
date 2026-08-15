import { describe, expect, test } from "bun:test";
import { join } from "node:path";

import { runOxlint } from "../test-support.ts";
import { parseDisableDirective } from "./rules.ts";

describe("disable directive parsing", () => {
  test.each([
    [" oxlint-disable-next-line no-console -- reason", { rules: "no-console", reason: "reason" }],
    [" eslint-disable-line no-console -- reason", { rules: "no-console", reason: "reason" }],
    [" oxlint-disable no-console", { rules: "no-console", reason: "" }],
    [" oxlint-disable -- reason", { rules: "", reason: "reason" }],
    [" oxlint-disabled-looking prose", null],
    [" ordinary comment", null],
  ])("parses %j", (value, expected) => {
    expect(parseDisableDirective(value)).toEqual(expected);
  });
});

describe("disable directive rules", () => {
  test.each([
    [
      "require-disable-reason",
      "require-disable-reason.valid.ts",
      "require-disable-reason.invalid.ts",
    ],
    ["no-unlimited-disable", "no-unlimited-disable.valid.ts", "no-unlimited-disable.invalid.ts"],
  ])("%s accepts valid directives and rejects invalid ones", (rule, valid, invalid) => {
    const result = runOxlint(rule, [
      join(import.meta.dir, "fixtures", valid),
      join(import.meta.dir, "fixtures", invalid),
    ]);

    expect(result.diagnostics.filter((diagnostic) => diagnostic.filename.endsWith(valid))).toEqual(
      [],
    );
    expect(
      result.diagnostics
        .filter((diagnostic) => diagnostic.filename.endsWith(invalid))
        .map((diagnostic) => diagnostic.code),
    ).toContain(`freee-cli(${rule})`);
    expect(result.exitCode).not.toBe(0);
  });
});
