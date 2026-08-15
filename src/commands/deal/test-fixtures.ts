import type { Deal } from "../../types/freee/types.gen.ts";

export function createMockDeal(overrides: Partial<Deal> & Pick<Deal, "id">): Deal {
  return {
    company_id: 123,
    issue_date: "2026-01-01",
    amount: 10000,
    partner_id: null,
    status: "settled",
    details: [],
    ...overrides,
  };
}
