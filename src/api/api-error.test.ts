import { describe, expect, test } from "bun:test";

import { CliError, errorHints } from "../errors.ts";
import { freeeApiError } from "./api-error.ts";

describe("freeeApiError", () => {
  test("uses the HTTP response status instead of trusting the body", () => {
    const cause = { status_code: 401, message: "denied" };
    const error = freeeApiError(cause, { status: 403 });

    expect(error).toBeInstanceOf(CliError);
    expect(error).toMatchObject({ code: "ACCESS_DENIED", exitCode: 2, cause });
  });

  test("keeps invoice authentication guidance at the client seam", () => {
    const error = freeeApiError(
      { message: "The access token is invalid" },
      { product: "invoice", status: 401 },
    );

    expect(error).toMatchObject({
      code: "AUTHENTICATION",
      exitCode: 2,
      hint: errorHints.authentication,
    });
    expect(error.why).toContain("invoice API");
  });

  test("ignores malformed nested message values", () => {
    const cause = { errors: [null, { messages: ["valid", 42] }] };
    expect(freeeApiError(cause, { status: 400 })).toMatchObject({
      code: "INVALID_INPUT",
      cause,
    });
  });

  test("classifies transport failures without an HTTP response", () => {
    const cause = new TypeError("network down");

    expect(freeeApiError(cause)).toMatchObject({
      code: "UPSTREAM_FAILURE",
      cause,
    });
  });

  test("does not infer an HTTP status from an untrusted body", () => {
    expect(freeeApiError({ status_code: 401, message: "failed" })).toMatchObject({
      code: "UPSTREAM_FAILURE",
    });
  });

  test.each([
    [400, "INVALID_INPUT", 1],
    [401, "AUTHENTICATION", 2],
    [403, "ACCESS_DENIED", 2],
    [404, "NOT_FOUND", 1],
    [429, "RATE_LIMITED", 1],
    [503, "UPSTREAM_FAILURE", 1],
  ] as const)("maps HTTP %i to %s", (status, code, exitCode) => {
    expect(freeeApiError({ message: "request failed" }, { status })).toMatchObject({
      code,
      exitCode,
    });
  });
});
