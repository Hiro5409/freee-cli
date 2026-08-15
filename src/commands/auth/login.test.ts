import { describe, expect, mock, spyOn, test } from "bun:test";

import { openAuthorizationUrl } from "./login.ts";

describe("openAuthorizationUrl", () => {
  test("starts the platform browser command", () => {
    const spawn = mock(() => undefined);

    expect(openAuthorizationUrl("https://example.invalid/auth", "darwin", spawn)).toBe(true);
    expect(spawn).toHaveBeenCalledWith(["open", "https://example.invalid/auth"]);
  });

  test("allows manual authentication when the browser command is unavailable", () => {
    const consoleError = spyOn(console, "error").mockImplementation(() => undefined);
    const spawn = mock(() => {
      throw new Error("command not found");
    });

    expect(openAuthorizationUrl("https://example.invalid/auth", "linux", spawn)).toBe(false);
    expect(consoleError).toHaveBeenCalledWith(
      expect.stringContaining("Open the URL above manually"),
    );
    consoleError.mockRestore();
  });
});
