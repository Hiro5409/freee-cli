import { configureClient } from "../../api/client.ts";
import { PositiveIntegerTextSchema, parseCliInput } from "../../cli-input.ts";
import { configDir } from "../../config/config.ts";
import { CliError, OutcomeUnknownError } from "../../errors.ts";
import { invoicesShow } from "../../types/freee-invoice/sdk.gen.ts";
import type { InvoiceShowResponseInvoice } from "../../types/freee-invoice/types.gen.ts";
import { type FreeeWebOperations, withFreeeWeb } from "./freee-web.ts";
import { resolveWebCommandScope, type WebCommandScope } from "./web-command-scope.ts";

type Values = {
  "dry-run"?: boolean;
  id?: unknown;
  profile?: unknown;
};

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
    why: "Deal registration requires one active, unregistered invoice.",
    hint: 'Use "freee invoice-list --deal-status unregistered --cancel-status uncanceled --format json" and retry with its ID.',
  });
}

function identifyTarget(invoice: InvoiceShowResponseInvoice, companyId: number) {
  if (invoice.company_id !== companyId) {
    throw invalidInvoice(`Invoice ${invoice.id} does not belong to company ${companyId}.`);
  }
  if (invoice.cancel_status === "canceled") {
    throw invalidInvoice(`Invoice ${invoice.id} is canceled.`);
  }
  if (
    invoice.deal_status !== "unregistered" ||
    (invoice.deal_id !== null && invoice.deal_id !== undefined)
  ) {
    throw invalidInvoice(`Invoice ${invoice.id} is already registered as a Deal.`);
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

function registeredDealId(invoice: InvoiceShowResponseInvoice, companyId: number): number {
  const dealId = invoice.deal_id;
  if (
    invoice.company_id !== companyId ||
    invoice.deal_status !== "registered" ||
    typeof dealId !== "number" ||
    !Number.isSafeInteger(dealId) ||
    dealId < 1
  ) {
    throw new Error("The official invoice API does not report a registered Deal.");
  }
  return dealId;
}

export async function runInvoiceRegisterDealCommand(
  values: Values,
  dependencies: Partial<Dependencies> = {},
) {
  const deps = { ...defaultDependencies, ...dependencies };
  const invoiceId = parseCliInput(PositiveIntegerTextSchema, values.id, { label: "--id" });
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
    action: "register-deal" as const,
    target,
  };

  return deps.withWeb(scope, async (web: FreeeWebOperations) => {
    if (values["dry-run"] === true) {
      await web.inspectInvoiceDealRegistration(invoiceId);
      return { ...result, dryRun: true as const };
    }

    let writeError: unknown;
    try {
      await web.registerInvoiceDeal(invoiceId);
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
      return {
        ...result,
        registered: true as const,
        dealId: registeredDealId(after, scope.companyId),
      };
    } catch (verificationError) {
      const causes =
        writeError === undefined ? [verificationError] : [writeError, verificationError];
      throw new OutcomeUnknownError("freee invoice Deal registration could not be verified.", {
        cause: new AggregateError(causes, "Invoice Deal registration verification failed."),
      });
    }
  });
}
