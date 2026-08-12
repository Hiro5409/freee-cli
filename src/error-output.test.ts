import { afterEach, describe, expect, spyOn, test } from "bun:test";

import { errorExitCode, printError } from "./error-output.ts";

const consoleError = spyOn(console, "error").mockImplementation(() => undefined);

afterEach(() => {
  consoleError.mockClear();
});

describe("freee API errors", () => {
  test("renders validation errors as What, Why, and Hint", () => {
    const error = {
      status_code: 400,
      errors: [{ messages: ["billing_dateは必須です。"] }],
    };

    expect(printError(error, "table", ["invoice-create"])).toBe(1);
    expect(consoleError.mock.calls.map(([message]) => String(message)).join("\n")).toContain(
      "billing_dateは必須です。",
    );
    expect(consoleError.mock.calls.map(([message]) => String(message)).join("\n")).toContain(
      "Why:",
    );
    expect(consoleError.mock.calls.map(([message]) => String(message)).join("\n")).toContain(
      "Hint:",
    );
  });

  test("renders authentication errors as structured JSON with exit code 2", () => {
    const error = { status_code: 401, message: "The access token is invalid" };

    expect(printError(error, "json", ["deal-list"])).toBe(2);
    expect(errorExitCode(error)).toBe(2);
    const payload = JSON.parse(String(consoleError.mock.calls[0]?.[0]));
    expect(payload).toEqual({
      error: "freee API error (401): The access token is invalid",
      exitCode: 2,
      why: "freee rejected the authentication credentials.",
      hint: expect.stringContaining("freee login --profile <name>"),
    });
  });

  test("recognizes the status-less authentication body from the generated client", () => {
    const error = { message: "The access token is invalid" };

    expect(printError(error, "json", ["deal-list"])).toBe(2);
    const payload = JSON.parse(String(consoleError.mock.calls[0]?.[0]));
    expect(payload.error).toBe("freee API error: The access token is invalid");
    expect(payload.why).toContain("authentication credentials or resource access");
    expect(payload.hint).toContain("freee login --profile <name>");
  });

  test("recognizes a status-less validation body from the generated client", () => {
    const error = { errors: [{ messages: ["company_idは必須です。"] }] };

    expect(printError(error, "json", ["deal-list"])).toBe(1);
    const payload = JSON.parse(String(consoleError.mock.calls[0]?.[0]));
    expect(payload.error).toBe("freee API error (unknown): company_idは必須です。");
    expect(payload.hint).toBeTruthy();
  });

  test("gives rate limits and server failures an actionable next step", () => {
    for (const status of [429, 503]) {
      consoleError.mockClear();
      printError({ status_code: status, message: "request failed" }, "json", ["deal-list"]);
      const payload = JSON.parse(String(consoleError.mock.calls[0]?.[0]));
      expect(payload.why).toBeTruthy();
      expect(payload.hint).toBeTruthy();
    }
  });
});
