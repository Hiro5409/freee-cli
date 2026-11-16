import { afterEach, describe, expect, spyOn, test } from "bun:test";

import { errorExitCode, printError } from "./error-output.ts";
import { AuthError, ConfigError, errorHints } from "./errors.ts";

const consoleError = spyOn(console, "error").mockImplementation(() => undefined);

afterEach(() => {
  consoleError.mockClear();
});

describe("error output", () => {
  test("writes an authentication error as one line of JSON", () => {
    const error = new AuthError("The access token is invalid");

    expect(printError(error, ["deal", "list"])).toBe(2);
    expect(errorExitCode(error)).toBe(2);
    const output = String(consoleError.mock.calls[0]?.[0]);
    expect(output).not.toContain("\n");
    expect(JSON.parse(output)).toEqual({
      code: "AUTHENTICATION",
      error: "The access token is invalid",
      exitCode: 2,
      why: "Authentication credentials are missing or invalid.",
      hint: errorHints.authentication,
    });
  });

  test("gives every JSON error a stable code", () => {
    expect(printError(new ConfigError("config missing", { hint: "Run setup." }), ["setup"])).toBe(
      3,
    );
    expect(JSON.parse(String(consoleError.mock.calls[0]?.[0]))).toMatchObject({
      code: "CONFIGURATION",
      error: "config missing",
      exitCode: 3,
      hint: "Run setup.",
    });

    consoleError.mockClear();
    printError(new AggregateError([new Error("bad args")]), ["deal", "list"]);
    expect(JSON.parse(String(consoleError.mock.calls[0]?.[0])).code).toBe("INVALID_INPUT");

    consoleError.mockClear();
    printError(new Error("unexpected"), ["deal", "list"]);
    expect(JSON.parse(String(consoleError.mock.calls[0]?.[0])).code).toBe("UNEXPECTED");
  });
});
