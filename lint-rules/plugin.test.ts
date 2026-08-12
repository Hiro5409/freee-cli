import { describe, expect, test } from "bun:test";
import { join } from "node:path";

import type { TSESTree } from "@typescript-eslint/types";

import plugin from "./plugin.ts";

// --- fixture を実際の oxlint に通す ---
// AST を組み立てて visitor を直接呼ぶ方式では、oxlint が rule を読み込めているか
// （plugin の登録・rule 名・診断の出力形式）までは検証できない。

const repositoryRoot = join(import.meta.dir, "..");
const oxlint = join(repositoryRoot, "node_modules", ".bin", "oxlint");
const fixtureConfig = join(import.meta.dir, "fixtures.oxlintrc.json");

const runOxlint = (fixture: string) => {
  const result = Bun.spawnSync(
    [oxlint, "--format", "json", "--config", fixtureConfig, join(import.meta.dir, fixture)],
    {
      cwd: repositoryRoot,
      stderr: "pipe",
      stdout: "pipe",
    },
  );

  // 既定の出力形式は summary に実行環境で変わる値（スレッド数・所要時間）を含む。
  // 診断だけを構造で受け取り、環境差がテストの成否に漏れないようにする
  const report: { diagnostics: { code: string }[] } = JSON.parse(result.stdout.toString());

  return { exitCode: result.exitCode, diagnostics: report.diagnostics };
};

const fixtureRules = ["no-unlimited-disable", "require-disable-reason", "require-dry-run"] as const;

describe("freee-cli Oxlint plugin", () => {
  for (const rule of fixtureRules) {
    test(`${rule} accepts its valid fixture`, () => {
      const result = runOxlint(`${rule}.valid.ts`);
      expect(result.diagnostics).toEqual([]);
      expect(result.exitCode).toBe(0);
    });

    test(`${rule} rejects its invalid fixture`, () => {
      const result = runOxlint(`${rule}.invalid.ts`);
      expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toContain(
        `freee-cli(${rule})`,
      );
      expect(result.exitCode).not.toBe(0);
    });
  }

  test("require-dry-run leaves read-only files alone", () => {
    const result = runOxlint("require-dry-run.read-only.valid.ts");
    expect(result.diagnostics).toEqual([]);
    expect(result.exitCode).toBe(0);
  });

  test("require-dry-run reports both write paths (sdk.gen import and raw client call)", () => {
    const result = runOxlint("require-dry-run.invalid.ts");
    const codes = result.diagnostics.map((diagnostic) => diagnostic.code);
    expect(codes.filter((code) => code === "freee-cli(require-dry-run)")).toHaveLength(2);
    expect(result.exitCode).not.toBe(0);
  });

  test("require-dry-run rejects a dry-run check that does not exit before writing", () => {
    const result = runOxlint("require-dry-run.non-gating.invalid.ts");
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toContain(
      "freee-cli(require-dry-run)",
    );
    expect(result.exitCode).not.toBe(0);
  });

  test("no-cross-command-import allows same-command and out-of-root imports", () => {
    const result = runOxlint("cross-command/deal/list.valid.ts");
    expect(result.diagnostics).toEqual([]);
    expect(result.exitCode).toBe(0);
  });

  test("no-cross-command-import rejects imports from sibling commands", () => {
    const result = runOxlint("cross-command/deal/update.invalid.ts");
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toContain(
      "freee-cli(no-cross-command-import)",
    );
    expect(result.exitCode).not.toBe(0);
  });
});

// --- コメント走査ロジックを直接呼ぶ ---
// eslint- / oxlint- 両接頭辞や -line / -next-line の変種は fixture より表で網羅する方が読める

type TestComment = { value: string; loc: TSESTree.SourceLocation };

const comment = (value: string, line = 1): TestComment => ({
  value,
  loc: { start: { line, column: 0 }, end: { line, column: value.length + 2 } },
});

const runOnComments = (
  ruleName: "require-disable-reason" | "no-unlimited-disable",
  comments: TestComment[],
): number => {
  let reports = 0;
  const visitors = plugin.rules[ruleName].create({
    filename: "test.ts",
    sourceCode: {
      getText: () => "",
      getAllComments: () => comments,
    },
    report: () => {
      reports += 1;
    },
  });
  visitors.Program();
  return reports;
};

describe("disable directive parsing", () => {
  test.each([
    [" oxlint-disable-next-line no-console -- reason", 0],
    [" eslint-disable-next-line no-console -- reason", 0],
    [" oxlint-disable-line no-console -- reason", 0],
    [" oxlint-disable no-console", 1],
    [" eslint-disable no-console", 1],
    [" this is a normal comment", 0],
  ])("require-disable-reason on %j reports %i", (value, expected) => {
    expect(runOnComments("require-disable-reason", [comment(value)])).toBe(expected);
  });

  test.each([
    [" oxlint-disable-next-line no-console -- reason", 0],
    [" oxlint-disable-next-line -- a reason, but no rule name", 1],
    [" oxlint-disable", 1],
    [" oxlint-disabled-looking prose, not a directive", 0],
  ])("no-unlimited-disable on %j reports %i", (value, expected) => {
    expect(runOnComments("no-unlimited-disable", [comment(value)])).toBe(expected);
  });
});
