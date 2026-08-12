import { describe, expect, test } from "bun:test";

import { formatDryRun, formatOutput, formatValue } from "./formatter.ts";

describe("formatOutput", () => {
  const data = [
    { id: 1, name: "Alice", amount: 1000 },
    { id: 2, name: "Bob", amount: 2000 },
  ];

  test("json format returns pretty JSON string", () => {
    const result = formatOutput(data, "json");
    expect(JSON.parse(result)).toEqual(data);
  });

  test("table format returns string with headers", () => {
    const result = formatOutput(data, "table");
    expect(result).toContain("id");
    expect(result).toContain("name");
    expect(result).toContain("Alice");
    expect(result).toContain("2000");
  });

  test("empty array returns 'No results' message", () => {
    const result = formatOutput([], "table");
    expect(result).toContain("No results");
  });

  test("json format with empty array returns []", () => {
    const result = formatOutput([], "json");
    expect(JSON.parse(result)).toEqual([]);
  });
});

describe("formatValue", () => {
  test("returns machine-readable JSON when requested", () => {
    expect(JSON.parse(formatValue({ id: 42 }, "json", "created"))).toEqual({ id: 42 });
  });

  test("returns the human representation for table output", () => {
    expect(formatValue({ id: 42 }, "table", "created")).toBe("created");
  });
});

describe("formatDryRun", () => {
  test("returns a structured request for JSON output", () => {
    const output = formatDryRun(
      "json",
      { method: "POST", path: "/api/1/deals", body: { company_id: 123 } },
      "preview",
    );

    expect(JSON.parse(output)).toEqual({
      dryRun: true,
      request: { method: "POST", path: "/api/1/deals", body: { company_id: 123 } },
    });
  });

  test("preserves the human preview for table output", () => {
    expect(formatDryRun("table", { method: "DELETE", path: "/api/1/deals/42" }, "preview")).toBe(
      "preview",
    );
  });
});
