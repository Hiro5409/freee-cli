import { describe, expect, mock, test } from "bun:test";

import { openBrowser } from "./browser.ts";

describe("openBrowser", () => {
  test("uses the macOS browser launcher", () => {
    const spawn = mock(() => undefined);

    expect(openBrowser("https://example.invalid", { platform: "darwin", spawn })).toBe(true);
    expect(spawn).toHaveBeenCalledWith(["open", "https://example.invalid"]);
  });

  test("prefers a WSL browser launcher on Linux", () => {
    const spawn = mock(() => undefined);
    const which = mock((command: string) =>
      command === "wslview" || command === "xdg-open" ? `/usr/bin/${command}` : null,
    );

    expect(openBrowser("https://example.invalid", { platform: "linux", spawn, which })).toBe(true);
    expect(spawn).toHaveBeenCalledWith(["wslview", "https://example.invalid"]);
  });

  test("does not route URLs through the native Windows shell", () => {
    const spawn = mock(() => undefined);

    expect(openBrowser("https://example.invalid?a=1&b=2", { platform: "win32", spawn })).toBe(
      false,
    );
    expect(spawn).not.toHaveBeenCalled();
  });

  test("returns false when no browser launcher is available", () => {
    const spawn = mock(() => undefined);

    expect(
      openBrowser("https://example.invalid", {
        platform: "linux",
        spawn,
        which: () => null,
      }),
    ).toBe(false);
    expect(spawn).not.toHaveBeenCalled();
  });

  test("returns false when the browser launcher fails", () => {
    expect(
      openBrowser("https://example.invalid", {
        platform: "darwin",
        spawn: () => {
          throw new Error("command not found");
        },
      }),
    ).toBe(false);
  });
});
