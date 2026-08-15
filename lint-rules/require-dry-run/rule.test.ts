import { expect, test } from "bun:test";
import { join } from "node:path";

import { runOxlint } from "../test-support.ts";

test("freee writes require a preceding dry-run return", () => {
  const commands = join(import.meta.dir, "fixtures", "src", "commands");
  const valid = join(commands, "write", "valid.ts");
  const invalid = [
    join(commands, "write", "missing-gate.invalid.ts"),
    join(commands, "write", "non-gating.invalid.ts"),
    join(commands, "send", "write.invalid.ts"),
  ];
  const result = runOxlint("require-dry-run", [valid, ...invalid]);

  expect(result.diagnostics.filter((diagnostic) => diagnostic.filename.endsWith(valid))).toEqual(
    [],
  );
  expect(
    result.diagnostics.filter((diagnostic) =>
      invalid.some((fixture) => diagnostic.filename.endsWith(fixture)),
    ),
  ).toHaveLength(4);
  expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
    "freee-cli(require-dry-run)",
    "freee-cli(require-dry-run)",
    "freee-cli(require-dry-run)",
    "freee-cli(require-dry-run)",
  ]);
  expect(result.exitCode).not.toBe(0);
});
