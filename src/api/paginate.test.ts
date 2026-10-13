import { describe, expect, test } from "bun:test";

import { fetchAll } from "./paginate.ts";

describe("fetchAll", () => {
  test("returns single page when results < pageSize", async () => {
    const fetcher = async (_offset: number, _limit: number) => [1, 2, 3];
    const result = await fetchAll(fetcher);
    expect(result).toEqual([1, 2, 3]);
  });

  test("fetches multiple pages until page is shorter than pageSize", async () => {
    let call = 0;
    const fetcher = async (_offset: number, _limit: number) => {
      call++;
      if (call === 1) return Array.from({ length: 100 }, (_, i) => i);
      if (call === 2) return Array.from({ length: 100 }, (_, i) => 100 + i);
      return Array.from({ length: 50 }, (_, i) => 200 + i);
    };
    const result = await fetchAll(fetcher);
    expect(result.length).toBe(250);
    expect(result[0]).toBe(0);
    expect(result[249]).toBe(249);
  });

  test("returns the requested count when the API requires offset to be a multiple of limit", async () => {
    const entries = Array.from({ length: 240 }, (_, i) => i);
    const fetcher = async (offset: number, limit: number) => {
      if (offset % limit !== 0) throw new Error("offset must be a multiple of limit");
      return entries.slice(offset, offset + limit);
    };

    const result = await fetchAll(fetcher, 130);
    expect(result).toEqual(entries.slice(0, 130));
  });

  test("returns empty array when first page is empty", async () => {
    const fetcher = async (_offset: number, _limit: number): Promise<number[]> => [];
    const result = await fetchAll(fetcher);
    expect(result).toEqual([]);
  });
});
