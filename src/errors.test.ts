import { describe, expect, test } from "bun:test";

import { AuthError, CliError, ConfigError, errorHints } from "./errors.ts";

describe("CliError", () => {
  test("has message and default exitCode=1", () => {
    const err = new CliError("something failed");
    expect(err.message).toBe("something failed");
    expect(err.exitCode).toBe(1);
    expect(err).toBeInstanceOf(Error);
  });

  test("accepts custom exitCode", () => {
    const err = new CliError("custom", 42);
    expect(err.exitCode).toBe(42);
  });

  test("accepts structured metadata", () => {
    const err = new CliError("custom", {
      exitCode: 7,
      why: "why text",
      hint: "Try the next action.",
    });
    expect(err.exitCode).toBe(7);
    expect(err.why).toBe("why text");
    expect(err.hint).toBe("Try the next action.");
  });

  test("name is CliError", () => {
    const err = new CliError("test");
    expect(err.name).toBe("CliError");
  });
});

describe("AuthError", () => {
  test("exitCode is 2", () => {
    const err = new AuthError("not authenticated");
    expect(err.exitCode).toBe(2);
    expect(err.message).toBe("not authenticated");
    expect(err.why).toBe("Authentication credentials are missing or invalid.");
    expect(err.hint).toBe(errorHints.authentication);
    expect(err).toBeInstanceOf(CliError);
  });

  test("name is AuthError", () => {
    expect(new AuthError("test").name).toBe("AuthError");
  });
});

describe("ConfigError", () => {
  test("exitCode is 3", () => {
    const err = new ConfigError("config missing");
    expect(err.exitCode).toBe(3);
    expect(err.message).toBe("config missing");
    expect(err).toBeInstanceOf(CliError);
  });

  test("name is ConfigError", () => {
    expect(new ConfigError("test").name).toBe("ConfigError");
  });
});
