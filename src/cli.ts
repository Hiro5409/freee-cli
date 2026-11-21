import { cli, define } from "gunshi";

import { apiCommands } from "./api-commands.ts";
import { client, hrClient, invoiceClient } from "./api/client.ts";
import { commandGroup, requireSubcommand } from "./command-group.ts";
import { loginCommand } from "./commands/auth/login.ts";
import { logoutCommand } from "./commands/auth/logout.ts";
import { statusCommand } from "./commands/auth/status.ts";
import { companySetDefaultCommand } from "./commands/company/set-default.ts";
import { profileListCommand } from "./commands/profile/list.ts";
import { profileSetDefaultCommand } from "./commands/profile/set-default.ts";
import { setupCommand } from "./commands/setup.ts";
import { printError } from "./error-output.ts";
import { CliError } from "./errors.ts";
import { globalArgs } from "./global-args.ts";
import { writeOutput } from "./output/write.ts";
import { commands as hrCommands } from "./types/freee-hr/commands.gen.ts";
import { commands as invoiceCommands } from "./types/freee-invoice/commands.gen.ts";
import { commands as accountingCommands } from "./types/freee/commands.gen.ts";

const commands = {
  auth: commandGroup("auth", "Manage authentication", {
    login: loginCommand,
    logout: logoutCommand,
    status: statusCommand,
  }),
  setup: setupCommand,
  profile: commandGroup("profile", "List connection profiles and choose a default", {
    list: profileListCommand,
    "set-default": profileSetDefaultCommand,
  }),
  company: commandGroup("company", "Choose the default company of a profile", {
    switch: companySetDefaultCommand,
  }),
  ...apiCommands([
    {
      name: "accounting",
      description: "freee Accounting API",
      baseUrl: client.getConfig().baseUrl ?? "",
      commands: accountingCommands,
    },
    {
      name: "invoice",
      description: "freee Invoice API",
      baseUrl: invoiceClient.getConfig().baseUrl ?? "",
      commands: invoiceCommands,
    },
    {
      name: "hr",
      description: "freee HR API",
      baseUrl: hrClient.getConfig().baseUrl ?? "",
      commands: hrCommands,
    },
  ]),
};

const rootCommand = define({
  name: "freee",
  description: "freee CLI - Command line interface for freee API",
  args: globalArgs,
  examples: `# Configure credentials and a default company
$ freee setup

# Read data for automation
$ freee accounting deal list --start-issue-date 2026-08-01 --end-issue-date 2026-08-31 --all

# Inspect a request body before writing
$ freee schema accounting deal create`,
  run: requireSubcommand,
});

export async function main() {
  const pkg = await import("../package.json", { with: { type: "json" } });

  await cli(process.argv.slice(2), rootCommand, {
    name: "freee",
    version: pkg.default.version,
    subCommands: commands,
    strict: true,
    renderHeader: null,
    usageSilent: true,
    renderValidationErrors: null,
    onBeforeCommand: (ctx) => {
      const extra = ctx.positionals.slice(ctx.commandPath.length);
      if (extra.length > 0 && ctx.commandPath.length > 0 && ctx.commandPath.at(-1) !== "schema") {
        throw new CliError(`Unexpected argument: ${extra.join(" ")}`, {
          code: "INVALID_INPUT",
          why: "This command takes only options.",
          hint: "Pass values as --name value, and booleans as --flag or --flag=false.",
        });
      }
    },
    onAfterCommand: (_ctx, result) => (result ? writeOutput(result) : undefined),
    onErrorCommand: (ctx, error) => {
      printError(error, ctx.commandPath);
    },
  });
}
