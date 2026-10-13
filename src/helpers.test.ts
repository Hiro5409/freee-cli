import { describe, expect, test } from "bun:test";

import { monthToDateRange } from "./helpers.ts";

describe("monthToDateRange", () => {
  test("通常月 2026-03 → 01〜31", () => {
    expect(monthToDateRange({ year: 2026, month: 3 })).toEqual({
      start: "2026-03-01",
      end: "2026-03-31",
    });
  });

  test("うるう年 2024-02 → 01〜29", () => {
    expect(monthToDateRange({ year: 2024, month: 2 })).toEqual({
      start: "2024-02-01",
      end: "2024-02-29",
    });
  });

  test("非うるう年 2025-02 → 01〜28", () => {
    expect(monthToDateRange({ year: 2025, month: 2 })).toEqual({
      start: "2025-02-01",
      end: "2025-02-28",
    });
  });

  test("12月 2026-12 → 01〜31", () => {
    expect(monthToDateRange({ year: 2026, month: 12 })).toEqual({
      start: "2026-12-01",
      end: "2026-12-31",
    });
  });
});
