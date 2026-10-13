import { describe, expect, test } from "bun:test";

import { formatOutput } from "./formatter.ts";

describe("formatOutput", () => {
  const data = [
    { id: 1, name: "Alice", amount: 1000 },
    { id: 2, name: "Bob", amount: 2000 },
  ];

  test("table format returns string with headers", () => {
    const result = formatOutput(data, "table");
    expect(result).toContain("id");
    expect(result).toContain("name");
    expect(result).toContain("Alice");
    expect(result).toContain("2000");
  });

  test("table format removes terminal control sequences", () => {
    const result = formatOutput(
      [{ name: "safe\u001b]8;;https://evil.invalid\u0007link\u001b]8;;\u0007\u009b" }],
      "table",
    );
    expect(result).not.toContain("\u001b");
    expect(result).not.toContain("\u0007");
    expect(result).not.toContain("\u009b");
    expect(result).toContain("safelink");
    expect(result).not.toContain("evil.invalid");
  });

  test("empty array returns 'No results' message", () => {
    const result = formatOutput([], "table");
    expect(result).toContain("No results");
  });
});
