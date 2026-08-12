import { describe, expect, mock, test } from "bun:test";

import { cliEntrypoint, runSetupWizard, setupWizardScript } from "../../src/commands/setup.ts";
import { CliError } from "../../src/errors.ts";

describe("setup wizard", () => {
  test("bundles the three-stage wizard", () => {
    expect(setupWizardScript).toContain("TOTAL_STAGES=3");
    expect(setupWizardScript).toContain('stage "Create a freee application"');
    expect(setupWizardScript).toContain('stage "Save OAuth credentials"');
    expect(setupWizardScript).toContain('stage "Authenticate and select a company"');
    expect(setupWizardScript).toContain('chmod 600 "$ENV_FILE"');
    expect(setupWizardScript).toContain('note "Keep $ENV_FILE out of version control."');
  });

  test("reinvokes source entrypoints through Bun and standalone executables directly", () => {
    expect(cliEntrypoint("/workspace/bin/freee")).toBe("/workspace/bin/freee");
    expect(cliEntrypoint("/$bunfs/root/freee")).toBe("");
  });

  test("runs the wizard with the current CLI entrypoint and inherited terminal", async () => {
    const exited = Promise.resolve(0);
    const spawn = mock(() => ({ exited }));

    await runSetupWizard("wizard body", {
      cwd: "/workspace",
      runtime: "/usr/local/bin/bun",
      entrypoint: "/workspace/bin/freee",
      spawn,
    });

    expect(spawn).toHaveBeenCalledWith(
      ["bash", "-c", "wizard body"],
      expect.objectContaining({
        cwd: "/workspace",
        env: expect.objectContaining({
          FREEE_CLI_RUNTIME: "/usr/local/bin/bun",
          FREEE_CLI_ENTRYPOINT: "/workspace/bin/freee",
        }),
        stdin: "inherit",
        stdout: "inherit",
        stderr: "inherit",
      }),
    );
  });

  test("reports a failed wizard", async () => {
    const spawn = mock(() => ({ exited: Promise.resolve(7) }));

    expect(
      runSetupWizard("wizard body", { runtime: "/usr/bin/freee", entrypoint: "", spawn }),
    ).rejects.toBeInstanceOf(CliError);
  });
});
