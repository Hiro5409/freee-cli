import { describe, expect, test } from "bun:test";

import { buildDealUpdateBody } from "../../src/commands/deal/update.ts";
import { createMockDeal } from "../fixtures.ts";

const currentDeal = () =>
  createMockDeal({
    issue_date: "2026-03-15",
    type: "expense",
    partner_id: 55,
    ref_number: "INV-1",
    details: [
      {
        id: 10,
        account_item_id: 101,
        tax_code: 21,
        amount: 10_000,
        vat: 909,
        entry_side: "debit",
        description: "before",
        tag_ids: [7],
      },
    ],
    receipts: [
      {
        id: 70,
        status: "confirmed",
        mime_type: "image/jpeg",
        origin: "public_api",
        created_at: "2026-03-15T00:00:00+09:00",
        // oxlint-disable-next-line typescript/no-deprecated -- deprecated response fields must still be stripped from PUT bodies
        file_src: "https://example.invalid/receipt.jpg",
        user: { id: 1, email: "user@example.invalid" },
      },
    ],
  });

describe("deal update body", () => {
  test("preserves the complete replaceable deal when changing only description", () => {
    expect(buildDealUpdateBody(currentDeal(), 123, { description: "after" })).toEqual({
      company_id: 123,
      issue_date: "2026-03-15",
      type: "expense",
      partner_id: 55,
      ref_number: "INV-1",
      receipt_ids: [70],
      details: [
        {
          id: 10,
          account_item_id: 101,
          tax_code: 21,
          amount: 10_000,
          tag_ids: [7],
          description: "after",
          vat: 909,
        },
      ],
    });
  });

  test("updates account, tax code, and receipts without returning read-only fields", () => {
    const body = buildDealUpdateBody(currentDeal(), 123, {
      accountItemId: 202,
      taxCode: 2,
      receiptIds: [80, 81],
    });

    expect(body.details[0]).toEqual(expect.objectContaining({ account_item_id: 202, tax_code: 2 }));
    expect(body.details[0]).not.toHaveProperty("vat");
    expect(body.receipt_ids).toEqual([80, 81]);
    expect(body).not.toHaveProperty("payments");
    expect(body).not.toHaveProperty("renews");
    expect(body).not.toHaveProperty("status");
  });

  test("refuses to rewrite a deal whose type is unavailable", () => {
    expect(() => buildDealUpdateBody(createMockDeal({ type: undefined }), 123, {})).toThrow("type");
  });
});
