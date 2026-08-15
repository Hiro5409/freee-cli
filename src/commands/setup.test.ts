import { describe, expect, mock, test } from "bun:test";

import { CliError } from "../errors.ts";
import { runSetupWizard } from "./setup.ts";

describe("setup wizard", () => {
  test("runs the wizard with the configured CLI entrypoint and inherited terminal", async () => {
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
          FREEE_CLI_CONFIG_DIR: expect.any(String),
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
