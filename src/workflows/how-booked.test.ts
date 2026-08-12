import { describe, expect, test } from "bun:test";

import { formatHowBookedResults } from "./how-booked.ts";

describe("formatHowBookedResults", () => {
  test("returns structured JSON without terminal prose", () => {
    const output = formatHowBookedResults(
      [
        {
          date: "2026-08-01",
          amount: 1200,
          description: "ヨドバシ",
          accountItem: "消耗品費",
        },
      ],
      "json",
      "No matching transactions found.",
    );

    expect(JSON.parse(output)).toEqual({
      matches: [
        {
          date: "2026-08-01",
          amount: 1200,
          description: "ヨドバシ",
          accountItem: "消耗品費",
        },
      ],
      summary: [{ accountItem: "消耗品費", count: 1 }],
    });
  });

  test("returns an empty structured result for JSON output", () => {
    const output = formatHowBookedResults([], "json", "No matching transactions found.");
    expect(JSON.parse(output)).toEqual({ matches: [], summary: [] });
  });
});
