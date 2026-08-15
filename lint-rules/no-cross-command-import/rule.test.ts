import { expect, test } from "bun:test";
import { join } from "node:path";

import { runOxlint } from "../test-support.ts";

test("command modules can import locally but not from sibling commands", () => {
  const fixtures = join(import.meta.dir, "fixtures", "src", "commands");
  const valid = [join(fixtures, "deal", "list.valid.ts"), join(fixtures, "setup.test.valid.ts")];
  const invalid = join(fixtures, "deal", "update.invalid.ts");
  const result = runOxlint("no-cross-command-import", [...valid, invalid]);

  expect(
    result.diagnostics.filter((diagnostic) =>
      valid.some((fixture) => diagnostic.filename.endsWith(fixture)),
    ),
  ).toEqual([]);
  expect(
    result.diagnostics
      .filter((diagnostic) => diagnostic.filename.endsWith(invalid))
      .map((diagnostic) => diagnostic.code),
  ).toContain("freee-cli(no-cross-command-import)");
  expect(result.exitCode).not.toBe(0);
});
