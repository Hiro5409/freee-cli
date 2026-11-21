import { define, type SubCommandable } from "gunshi";

import { CliError } from "./errors.ts";

export function requireSubcommand(): never {
  throw new CliError("A subcommand is required.", {
    code: "INVALID_INPUT",
    why: "This command only groups subcommands.",
  });
}

export function commandGroup(
  name: string,
  description: string,
  subCommands: Record<string, SubCommandable>,
) {
  return define({ name, description, subCommands, run: requireSubcommand });
}
