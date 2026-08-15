import { describe, expect, test } from "bun:test";

import { formatDryRun, formatOutput, formatResource, formatValue } from "./formatter.ts";

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

describe("formatResource", () => {
  test("returns one JSON object while preserving table output", () => {
    const resource = { id: 42, name: "Acme" };
    expect(JSON.parse(formatResource(resource, "json"))).toEqual(resource);
    expect(formatResource(resource, "table")).toContain("id");
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
