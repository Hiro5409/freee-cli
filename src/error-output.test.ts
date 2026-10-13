import { afterEach, describe, expect, spyOn, test } from "bun:test";

import { errorExitCode, printError } from "./error-output.ts";
import { AuthError, CliError, errorHints } from "./errors.ts";

const consoleError = spyOn(console, "error").mockImplementation(() => undefined);

afterEach(() => {
  consoleError.mockClear();
});

describe("error output", () => {
  test("renders CliError as What, Why, and Hint", () => {
    const error = new CliError("billing_dateは必須です。", {
      code: "INVALID_INPUT",
      why: "freee rejected the request.",
      hint: errorHints.invalidValue,
    });

    expect(printError(error, "table", ["invoice-create"])).toBe(1);
    const output = consoleError.mock.calls.map(([message]) => String(message)).join("\n");
    expect(output).toContain("billing_dateは必須です。");
    expect(output).toContain("Why:");
    expect(output).toContain("Hint:");
  });

  test("renders authentication errors as structured JSON", () => {
    const error = new AuthError("The access token is invalid");

    expect(printError(error, "json", ["deal-list"])).toBe(2);
    expect(errorExitCode(error)).toBe(2);
    expect(JSON.parse(String(consoleError.mock.calls[0]?.[0]))).toEqual({
      code: "AUTHENTICATION",
      error: "The access token is invalid",
      exitCode: 2,
      why: "Authentication credentials are missing or invalid.",
      hint: errorHints.authentication,
    });
  });

  test("gives every JSON error a stable code", () => {
    printError(new AggregateError([new Error("bad args")]), "json", ["deal-list"]);
    expect(JSON.parse(String(consoleError.mock.calls[0]?.[0])).code).toBe("INVALID_INPUT");

    consoleError.mockClear();
    printError(new Error("unexpected"), "json", ["deal-list"]);
    expect(JSON.parse(String(consoleError.mock.calls[0]?.[0])).code).toBe("UNEXPECTED");
  });

  test("strips terminal controls from human errors", () => {
    const error = new CliError("bad\u001b[31m value\nHint: forged", {
      code: "INVALID_INPUT",
      why: "why\u001b]8;;https://example.com\u0007link\u001b]8;;\u0007",
      hint: "retry\rnow",
    });

    printError(error, "table", ["deal-list"]);
    const output = consoleError.mock.calls.map(([message]) => String(message)).join("\n");
    expect(output).not.toContain("\u001b]8");
    expect(output).not.toContain("\r");
    expect(String(consoleError.mock.calls[0]?.[0])).not.toContain("\n");
  });
});
