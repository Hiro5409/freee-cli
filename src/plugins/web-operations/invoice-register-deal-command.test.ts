import { describe, expect, test } from "bun:test";

import { createMockInvoice } from "../../commands/invoice/test-fixtures.ts";
import { OutcomeUnknownError } from "../../errors.ts";
import type { FreeeWebOperations } from "./freee-web.ts";
import { runInvoiceRegisterDealCommand } from "./invoice-register-deal-command.ts";

const scope = {
  profile: "business",
  companyId: 100,
  authProfile: "business-freee",
};

const invoice = createMockInvoice({
  id: 77,
  company_id: 100,
  invoice_number: "INV-77",
  subject: "8月分制作費",
  billing_date: "2026-08-31",
  partner_display_name: "合同会社VAB Labo",
  total_amount: 110_000,
});

function dependencies(
  input: {
    before?: Partial<typeof invoice>;
    after?: Partial<typeof invoice>;
    writeError?: Error;
  } = {},
) {
  const invoiceStates = [
    { ...invoice, ...input.before },
    {
      ...invoice,
      deal_status: "registered" as const,
      deal_id: 901,
      ...input.after,
    },
  ];
  let inspections = 0;
  let reads = 0;
  let writes = 0;
  const web = {
    inspectInvoiceDealRegistration: async () => {
      inspections += 1;
    },
    registerInvoiceDeal: async () => {
      writes += 1;
      if (input.writeError) throw input.writeError;
    },
  } as unknown as FreeeWebOperations;

  return {
    deps: {
      resolveScope: () => scope,
      readInvoice: async () => {
        reads += 1;
        const state = invoiceStates.shift();
        if (!state) throw new Error("unexpected invoice read");
        return state;
      },
      withWeb: async <T>(
        receivedScope: { companyId: number; authProfile: string },
        run: (receivedWeb: FreeeWebOperations) => Promise<T>,
      ) => {
        expect(receivedScope).toMatchObject({ companyId: 100, authProfile: "business-freee" });
        return run(web);
      },
    },
    inspections: () => inspections,
    reads: () => reads,
    writes: () => writes,
  };
}

describe("invoice register Deal command", () => {
  test("dry-run identifies one unregistered invoice and checks the Web action without writing", async () => {
    const { deps, inspections, writes } = dependencies();

    await expect(
      runInvoiceRegisterDealCommand({ id: "77", profile: "business", "dry-run": true }, deps),
    ).resolves.toEqual({
      profile: "business",
      companyId: 100,
      action: "register-deal",
      dryRun: true,
      target: {
        id: 77,
        invoiceNumber: "INV-77",
        subject: "8月分制作費",
        billingDate: "2026-08-31",
        partnerId: 456,
        partnerName: "合同会社VAB Labo",
        totalAmount: 110_000,
      },
    });
    expect(inspections()).toBe(1);
    expect(writes()).toBe(0);
  });

  test("registers once and verifies the Deal through the official invoice API", async () => {
    const { deps, inspections, writes } = dependencies();

    await expect(
      runInvoiceRegisterDealCommand({ id: "77", profile: "business" }, deps),
    ).resolves.toMatchObject({
      profile: "business",
      companyId: 100,
      action: "register-deal",
      dealId: 901,
      registered: true,
      target: { id: 77 },
    });
    expect(inspections()).toBe(0);
    expect(writes()).toBe(1);
  });

  test("rejects a canceled invoice before opening freee Web", async () => {
    const { deps, inspections, writes } = dependencies({
      before: { cancel_status: "canceled" },
    });

    await expect(
      runInvoiceRegisterDealCommand({ id: "77", profile: "business" }, deps),
    ).rejects.toThrow("canceled");
    expect(inspections()).toBe(0);
    expect(writes()).toBe(0);
  });

  test("rejects an invoice that already has a Deal", async () => {
    const { deps, writes } = dependencies({
      before: { deal_status: "registered", deal_id: 901 },
    });

    await expect(
      runInvoiceRegisterDealCommand({ id: "77", profile: "business" }, deps),
    ).rejects.toThrow("already registered");
    expect(writes()).toBe(0);
  });

  test("rejects a company mismatch before opening freee Web", async () => {
    const { deps, inspections, writes } = dependencies({ before: { company_id: 101 } });

    await expect(
      runInvoiceRegisterDealCommand({ id: "77", profile: "business" }, deps),
    ).rejects.toThrow("does not belong to company 100");
    expect(inspections()).toBe(0);
    expect(writes()).toBe(0);
  });

  test("reports an unknown outcome when registration cannot be verified", async () => {
    const { deps } = dependencies({
      after: { deal_status: "unregistered", deal_id: null },
    });

    await expect(
      runInvoiceRegisterDealCommand({ id: "77", profile: "business" }, deps),
    ).rejects.toBeInstanceOf(OutcomeUnknownError);
  });

  test("accepts verified registration after the Web confirmation was lost", async () => {
    const { deps } = dependencies({
      writeError: new OutcomeUnknownError("write confirmation was lost"),
    });

    await expect(
      runInvoiceRegisterDealCommand({ id: "77", profile: "business" }, deps),
    ).resolves.toMatchObject({ registered: true, dealId: 901 });
  });

  test("does not reread or convert a definite Web rejection into success", async () => {
    const { deps, reads } = dependencies({
      writeError: new Error("freee Web rejected the registration"),
    });

    await expect(
      runInvoiceRegisterDealCommand({ id: "77", profile: "business" }, deps),
    ).rejects.toThrow("rejected the registration");
    expect(reads()).toBe(1);
  });
});
