import { describe, expect, test } from "bun:test";

import { createMockInvoice } from "../../commands/invoice/test-fixtures.ts";
import { OutcomeUnknownError } from "../../errors.ts";
import type { FreeeWebOperations, InvoiceSendingStatus } from "./freee-web.ts";
import { runInvoiceSetSendingStatusCommand } from "./invoice-set-sending-status-command.ts";

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
  sending_status: "unsent",
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
    { ...invoice, sending_status: "sent" as const, ...input.after },
  ];
  const writtenStatuses: InvoiceSendingStatus[] = [];
  let reads = 0;
  let webSessions = 0;
  const web = {
    setInvoiceSendingStatus: async (_invoiceId: number, status: InvoiceSendingStatus) => {
      writtenStatuses.push(status);
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
        webSessions += 1;
        expect(receivedScope).toMatchObject({ companyId: 100, authProfile: "business-freee" });
        return run(web);
      },
    },
    reads: () => reads,
    webSessions: () => webSessions,
    writtenStatuses,
  };
}

describe("invoice set sending status command", () => {
  test("sets an unsent invoice to sent and verifies the official invoice API", async () => {
    const { deps, writtenStatuses } = dependencies();

    await expect(
      runInvoiceSetSendingStatusCommand({ id: "77", profile: "business", status: "sent" }, deps),
    ).resolves.toMatchObject({
      action: "set-sending-status",
      before: "unsent",
      after: "sent",
      changed: true,
      target: { id: 77 },
    });
    expect(writtenStatuses).toEqual(["sent"]);
  });

  test("sets a sent invoice back to unsent and verifies the official invoice API", async () => {
    const { deps, writtenStatuses } = dependencies({
      before: { sending_status: "sent" },
      after: { sending_status: "unsent" },
    });

    await expect(
      runInvoiceSetSendingStatusCommand({ id: "77", profile: "business", status: "unsent" }, deps),
    ).resolves.toMatchObject({ before: "sent", after: "unsent", changed: true });
    expect(writtenStatuses).toEqual(["unsent"]);
  });

  test("succeeds without opening freee Web when the requested state already exists", async () => {
    const { deps, reads, webSessions, writtenStatuses } = dependencies({
      before: { sending_status: "sent" },
    });

    await expect(
      runInvoiceSetSendingStatusCommand({ id: "77", profile: "business", status: "sent" }, deps),
    ).resolves.toMatchObject({ before: "sent", after: "sent", changed: false });
    expect(reads()).toBe(1);
    expect(webSessions()).toBe(0);
    expect(writtenStatuses).toEqual([]);
  });

  test("rejects a canceled invoice before opening freee Web", async () => {
    const { deps, webSessions } = dependencies({ before: { cancel_status: "canceled" } });

    await expect(
      runInvoiceSetSendingStatusCommand({ id: "77", profile: "business", status: "sent" }, deps),
    ).rejects.toThrow("canceled");
    expect(webSessions()).toBe(0);
  });

  test("rejects a company mismatch before opening freee Web", async () => {
    const { deps, webSessions } = dependencies({ before: { company_id: 101 } });

    await expect(
      runInvoiceSetSendingStatusCommand({ id: "77", profile: "business", status: "sent" }, deps),
    ).rejects.toThrow("does not belong to company 100");
    expect(webSessions()).toBe(0);
  });

  test("reports an unknown outcome when the requested state cannot be verified", async () => {
    const { deps } = dependencies({ after: { sending_status: "unsent" } });

    await expect(
      runInvoiceSetSendingStatusCommand({ id: "77", profile: "business", status: "sent" }, deps),
    ).rejects.toBeInstanceOf(OutcomeUnknownError);
  });

  test("accepts a verified state after the Web confirmation was lost", async () => {
    const { deps } = dependencies({
      writeError: new OutcomeUnknownError("write confirmation was lost"),
    });

    await expect(
      runInvoiceSetSendingStatusCommand({ id: "77", profile: "business", status: "sent" }, deps),
    ).resolves.toMatchObject({ changed: true, after: "sent" });
  });

  test("does not reread or convert a definite Web rejection into success", async () => {
    const { deps, reads } = dependencies({
      writeError: new Error("freee Web rejected the status change"),
    });

    await expect(
      runInvoiceSetSendingStatusCommand({ id: "77", profile: "business", status: "sent" }, deps),
    ).rejects.toThrow("rejected the status change");
    expect(reads()).toBe(1);
  });
});
