import { describe, expect, test } from "bun:test";
import { join } from "node:path";

import { runOxlint } from "../test-support.ts";

describe("disable directive rules", () => {
  test.each([
    [
      "require-disable-reason",
      "require-disable-reason.valid.ts",
      "require-disable-reason.invalid.ts",
      3,
    ],
    ["no-unlimited-disable", "no-unlimited-disable.valid.ts", "no-unlimited-disable.invalid.ts", 1],
  ] as const)(
    "%s accepts valid directives and rejects invalid ones",
    (rule, valid, invalid, count) => {
      const result = runOxlint(rule, [
        join(import.meta.dir, "fixtures", valid),
        join(import.meta.dir, "fixtures", invalid),
      ]);

      expect(
        result.diagnostics.filter((diagnostic) => diagnostic.filename.endsWith(valid)),
      ).toEqual([]);
      expect(
        result.diagnostics
          .filter((diagnostic) => diagnostic.filename.endsWith(invalid))
          .map((diagnostic) => diagnostic.code),
      ).toEqual(Array.from({ length: count }, () => `freee-cli(${rule})`));
      expect(result.exitCode).not.toBe(0);
    },
  );
});
