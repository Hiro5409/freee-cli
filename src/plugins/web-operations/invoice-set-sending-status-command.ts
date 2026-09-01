import * as v from "valibot";

import { configureClient } from "../../api/client.ts";
import { PositiveIntegerTextSchema, parseCliInput } from "../../cli-input.ts";
import { configDir } from "../../config/config.ts";
import { CliError, OutcomeUnknownError } from "../../errors.ts";
import { invoicesShow } from "../../types/freee-invoice/sdk.gen.ts";
import type { InvoiceShowResponseInvoice } from "../../types/freee-invoice/types.gen.ts";
import { type FreeeWebOperations, type InvoiceSendingStatus, withFreeeWeb } from "./freee-web.ts";
import { resolveWebCommandScope, type WebCommandScope } from "./web-command-scope.ts";

type Values = {
  id?: unknown;
  profile?: unknown;
  status?: unknown;
};

const InvoiceSendingStatusSchema = v.picklist(["sent", "unsent"]);

type Dependencies = {
  resolveScope: (requestedProfile: unknown) => WebCommandScope;
  readInvoice: (input: {
    profile: string;
    companyId: number;
    invoiceId: number;
  }) => Promise<InvoiceShowResponseInvoice>;
  withWeb: typeof withFreeeWeb;
};

async function readInvoice(input: {
  profile: string;
  companyId: number;
  invoiceId: number;
}): Promise<InvoiceShowResponseInvoice> {
  configureClient(configDir(), input.profile);
  const { data } = await invoicesShow({
    path: { id: input.invoiceId },
    query: { company_id: input.companyId },
  });
  return data.invoice;
}

const defaultDependencies: Dependencies = {
  resolveScope: resolveWebCommandScope,
  readInvoice,
  withWeb: withFreeeWeb,
};

function invalidInvoice(message: string): CliError {
  return new CliError(message, {
    code: "INVALID_INPUT",
    why: "Changing the sending status requires one active invoice in the selected company.",
    hint: 'Use "freee invoice-show --id <id> --format json" and retry with its ID.',
  });
}

function identifyTarget(invoice: InvoiceShowResponseInvoice, companyId: number) {
  if (invoice.company_id !== companyId) {
    throw invalidInvoice(`Invoice ${invoice.id} does not belong to company ${companyId}.`);
  }
  if (invoice.cancel_status === "canceled") {
    throw invalidInvoice(`Invoice ${invoice.id} is canceled.`);
  }
  return {
    id: invoice.id,
    invoiceNumber: invoice.invoice_number,
    subject: invoice.subject,
    billingDate: invoice.billing_date,
    partnerId: invoice.partner_id,
    partnerName: invoice.partner_display_name ?? invoice.partner_name ?? "",
    totalAmount: invoice.total_amount,
  };
}

function assertStatus(
  invoice: InvoiceShowResponseInvoice,
  companyId: number,
  status: InvoiceSendingStatus,
): void {
  if (invoice.company_id !== companyId || invoice.sending_status !== status) {
    throw new Error(`The official invoice API does not report sending status ${status}.`);
  }
}

export async function runInvoiceSetSendingStatusCommand(
  values: Values,
  dependencies: Partial<Dependencies> = {},
) {
  const deps = { ...defaultDependencies, ...dependencies };
  const invoiceId = parseCliInput(PositiveIntegerTextSchema, values.id, { label: "--id" });
  const status = parseCliInput(InvoiceSendingStatusSchema, values.status, { label: "--status" });
  const scope = deps.resolveScope(values.profile);
  const before = await deps.readInvoice({
    profile: scope.profile,
    companyId: scope.companyId,
    invoiceId,
  });
  const target = identifyTarget(before, scope.companyId);
  const result = {
    profile: scope.profile,
    companyId: scope.companyId,
    action: "set-sending-status" as const,
    before: before.sending_status,
    after: status,
    target,
  };

  if (before.sending_status === status) {
    return { ...result, changed: false as const };
  }

  return deps.withWeb(scope, async (web: FreeeWebOperations) => {
    let writeError: unknown;
    try {
      await web.setInvoiceSendingStatus(invoiceId, status);
    } catch (error) {
      if (!(error instanceof OutcomeUnknownError)) throw error;
      writeError = error;
    }

    try {
      const after = await deps.readInvoice({
        profile: scope.profile,
        companyId: scope.companyId,
        invoiceId,
      });
      assertStatus(after, scope.companyId, status);
      return { ...result, changed: true as const };
    } catch (verificationError) {
      const causes =
        writeError === undefined ? [verificationError] : [writeError, verificationError];
      throw new OutcomeUnknownError("freee invoice sending status could not be verified.", {
        cause: new AggregateError(causes, "Invoice sending status verification failed."),
      });
    }
  });
}
