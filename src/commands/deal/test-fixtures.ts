import type { Deal } from "../../types/freee/types.gen.ts";

type DealPayment = NonNullable<Deal["payments"]>[number];

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

export function createMockDealPayment(
  overrides: Partial<DealPayment> & Pick<DealPayment, "id" | "date" | "amount">,
): DealPayment {
  return {
    partner_id: 0,
    partner_code: null,
    item_id: null,
    item_code: null,
    section_id: null,
    section_code: null,
    tag_ids: [],
    ...overrides,
  };
}
