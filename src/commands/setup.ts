import { define } from "gunshi";

import setupScript from "../../scripts/setup.sh" with { type: "text" };
import { CliError } from "../errors.ts";

type WizardProcess = { exited: Promise<number> };
type WizardSpawn = (
  command: string[],
  options: {
    cwd: string;
    env: Record<string, string | undefined>;
    stdin: "inherit";
    stdout: "inherit";
    stderr: "inherit";
  },
) => WizardProcess;

type SetupWizardOptions = {
  cwd?: string;
  runtime?: string;
  entrypoint?: string;
  spawn?: WizardSpawn;
};

export const setupWizardScript = setupScript;

export function cliEntrypoint(main = Bun.main): string {
  return main.startsWith("/$bunfs/") ? "" : main;
}

export async function runSetupWizard(
  script = setupWizardScript,
  options: SetupWizardOptions = {},
): Promise<void> {
  const runtime = options.runtime ?? process.execPath;
  const entrypoint = options.entrypoint ?? cliEntrypoint();
  const spawn: WizardSpawn =
    options.spawn ?? ((command, spawnOptions) => Bun.spawn(command, spawnOptions));
  const processHandle = spawn(["bash", "-c", script], {
    cwd: options.cwd ?? process.cwd(),
    env: {
      ...process.env,
      FREEE_CLI_RUNTIME: runtime,
      FREEE_CLI_ENTRYPOINT: entrypoint,
    },
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  });
  const exitCode = await processHandle.exited;
  if (exitCode !== 0) {
    throw new CliError(`Setup stopped with exit code ${exitCode}.`);
  }
}

export const setupCommand = define({
  name: "setup",
  description: "Interactive setup; coding agents should ask the user to run it",
  examples: "$ freee setup",
  run: () => runSetupWizard(),
});
