import { describe, expect, test } from "bun:test";

import { ConfigError, OutcomeUnknownError } from "./errors.ts";

describe("ConfigError", () => {
  test("exitCode is 3 and accepts an actionable hint", () => {
    const err = new ConfigError("config missing", { hint: "Run setup." });
    expect(err.exitCode).toBe(3);
    expect(err.code).toBe("CONFIGURATION");
    expect(err.message).toBe("config missing");
    expect(err.hint).toBe("Run setup.");
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
