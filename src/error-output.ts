import { stripVTControlCharacters } from "node:util";

import colors from "yoctocolors";

import { CliError, type CliErrorCode } from "./errors.ts";

const printedErrors = new WeakSet<object>();

export function wasErrorPrinted(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && printedErrors.has(error));
}

function markErrorPrinted(error: unknown): void {
  if (error && typeof error === "object") {
    printedErrors.add(error);
  }
}

export function formatFromArgv(argv: string[]): string {
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--format" || arg === "-f") return argv[i + 1] ?? "";
    if (arg?.startsWith("--format=")) return arg.slice("--format=".length);
  }
  return "";
}

export function errorExitCode(error: unknown): number {
  return error instanceof CliError ? error.exitCode : 1;
}

function errorCode(error: unknown): CliErrorCode {
  if (error instanceof CliError) return error.code;
  if (error instanceof AggregateError) return "INVALID_INPUT";
  return "UNEXPECTED";
}

function terminalSafeText(value: string): string {
  let safe = "";
  for (const character of stripVTControlCharacters(value)) {
    const code = character.charCodeAt(0);
    safe += code >= 0x20 && (code < 0x7f || code > 0x9f) ? character : " ";
  }
  return safe;
}

function errorMessage(error: unknown): string {
  if (error instanceof AggregateError && error.errors.length > 0) {
    return error.errors.map(errorMessage).filter(Boolean).join("\n");
  }
  if (error instanceof Error) return error.message;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

function errorGuidance(
  error: unknown,
  commandPath: readonly string[],
): { why?: string; hint?: string } {
  const command = ["freee", ...commandPath].join(" ");
  if (error instanceof CliError) {
    return {
      why: error.why ?? "The command could not complete with the current input or state.",
      hint:
        error.hint ??
        `Run "${command} --help" and retry after correcting the input or configuration.`,
    };
  }
  if (error instanceof AggregateError) {
    return {
      why: "The supplied command or arguments do not match the command interface.",
      hint: `Run "${command} --help" and retry with the listed command and arguments.`,
    };
  }
  return {
    why: "The command failed before freee-cli could classify the cause.",
    hint: `Run "${command} --help" and retry. If it fails again, report the complete error output.`,
  };
}

function errorPayload(error: unknown, commandPath: readonly string[]): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    code: errorCode(error),
    error: errorMessage(error),
    exitCode: errorExitCode(error),
  };

  const { why, hint } = errorGuidance(error, commandPath);
  if (why) payload.why = why;
  if (hint) payload.hint = hint;

  return payload;
}

export function printError(
  error: unknown,
  format: string,
  commandPath: readonly string[] = [],
): number {
  const { why, hint } = errorGuidance(error, commandPath);
  if (format === "json") {
    console.error(JSON.stringify(errorPayload(error, commandPath), null, 2));
  } else {
    console.error(colors.red(terminalSafeText(errorMessage(error))));
    if (why) console.error(colors.dim(`Why: ${terminalSafeText(why)}`));
    if (hint) console.error(colors.dim(`Hint: ${terminalSafeText(hint)}`));
  }
  markErrorPrinted(error);
  return errorExitCode(error);
}
