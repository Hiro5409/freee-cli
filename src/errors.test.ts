import { describe, expect, test } from "bun:test";

import { AuthError, CliError, ConfigError, errorHints, OutcomeUnknownError } from "./errors.ts";

describe("CliError", () => {
  test("has message, code, and default exitCode=1", () => {
    const err = new CliError("something failed", { code: "INVALID_INPUT" });
    expect(err.message).toBe("something failed");
    expect(err.code).toBe("INVALID_INPUT");
    expect(err.exitCode).toBe(1);
    expect(err).toBeInstanceOf(Error);
  });

  test("accepts structured metadata", () => {
    const cause = new Error("root cause");
    const err = new CliError("custom", {
      code: "PARTIAL_SUCCESS",
      exitCode: 7,
      why: "why text",
      hint: "Try the next action.",
      cause,
    });
    expect(err.exitCode).toBe(7);
    expect(err.code).toBe("PARTIAL_SUCCESS");
    expect(err.why).toBe("why text");
    expect(err.hint).toBe("Try the next action.");
    expect(err.cause).toBe(cause);
  });
});

describe("AuthError", () => {
  test("exitCode is 2", () => {
    const err = new AuthError("not authenticated");
    expect(err.exitCode).toBe(2);
    expect(err.code).toBe("AUTHENTICATION");
    expect(err.message).toBe("not authenticated");
    expect(err.why).toBe("Authentication credentials are missing or invalid.");
    expect(err.hint).toBe(errorHints.authentication);
    expect(err).toBeInstanceOf(CliError);
  });
});

describe("ConfigError", () => {
  test("exitCode is 3 and accepts an actionable hint", () => {
    const err = new ConfigError("config missing", { hint: "Run setup." });
    expect(err.exitCode).toBe(3);
    expect(err.code).toBe("CONFIGURATION");
    expect(err.message).toBe("config missing");
    expect(err.hint).toBe("Run setup.");
    expect(err).toBeInstanceOf(CliError);
  });
});

describe("OutcomeUnknownError", () => {
  test("prevents an uncertain write from looking safely retryable", () => {
    const cause = new Error("timed out");
    const err = new OutcomeUnknownError("freee write confirmation was lost.", { cause });

    expect(err.code).toBe("OUTCOME_UNKNOWN");
    expect(err.cause).toBe(cause);
    expect(err.why).toContain("accepted");
    expect(err.hint).toContain("Do not retry automatically");
  });
});
