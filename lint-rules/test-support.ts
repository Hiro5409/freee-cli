import { join, resolve } from "node:path";

const repositoryRoot = join(import.meta.dir, "..");
const oxlint = join(repositoryRoot, "node_modules", ".bin", "oxlint");
const fixtureConfig = join(import.meta.dir, "fixtures.oxlintrc.json");
const fixtureRules = [
  "no-cross-command-import",
  "no-unlimited-disable",
  "require-disable-reason",
  "require-dry-run",
] as const;

type Diagnostic = {
  code: string;
  filename: string;
};

const isDiagnostic = (value: unknown): value is Diagnostic =>
  typeof value === "object" &&
  value !== null &&
  "code" in value &&
  typeof value.code === "string" &&
  "filename" in value &&
  typeof value.filename === "string";

const parseDiagnostics = (json: string): Diagnostic[] => {
  const report: unknown = JSON.parse(json);
  if (
    typeof report !== "object" ||
    report === null ||
    !("diagnostics" in report) ||
    !Array.isArray(report.diagnostics) ||
    !report.diagnostics.every(isDiagnostic)
  ) {
    throw new Error("Oxlint returned an invalid JSON report");
  }

  return report.diagnostics;
};

export const runOxlint = (rule: string, fixtures: ReadonlyArray<string>) => {
  const ruleArgs = fixtureRules.flatMap((fixtureRule) => [
    fixtureRule === rule ? "--deny" : "--allow",
    `freee-cli/${fixtureRule}`,
  ]);
  const result = Bun.spawnSync(
    [oxlint, "--format", "json", "--config", fixtureConfig, ...ruleArgs, ...fixtures],
    {
      cwd: repositoryRoot,
      stderr: "pipe",
      stdout: "pipe",
    },
  );

  const stdout = result.stdout.toString();
  if (stdout === "") {
    throw new Error(result.stderr.toString() || `Oxlint exited with ${result.exitCode}`);
  }

  return {
    exitCode: result.exitCode,
    diagnostics: parseDiagnostics(stdout).map((diagnostic) => ({
      code: diagnostic.code,
      filename: resolve(repositoryRoot, diagnostic.filename),
    })),
  };
};
