import * as v from "valibot";

import { OutcomeUnknownError } from "../../errors.ts";
import { createAgentBrowserSession, type AgentBrowserSession } from "./agent-browser.ts";

export { OutcomeUnknownError } from "../../errors.ts";

const FREEE_ORIGIN = "https://secure.freee.co.jp";
const FREEE_INVOICE_ORIGIN = "https://invoice.secure.freee.co.jp";
const FREEE_LOGIN_URL = `${FREEE_ORIGIN}/`;
const AGENT_BROWSER_NAMESPACE = "freee-web";

const PositiveIntegerSchema = v.pipe(v.number(), v.integer(), v.minValue(1));
const NonEmptyStringSchema = v.pipe(v.string(), v.trim(), v.minLength(1));

const FreeeWebResponseSchema = v.object({
  origin: v.literal(FREEE_ORIGIN),
  status: v.number(),
  body: v.string(),
});
const FreeeSessionStateSchema = v.object({
  origin: v.string(),
  companyId: v.pipe(v.number(), v.integer(), v.minValue(0)),
});
const AgentBrowserNetworkRequestsSchema = v.object({
  requests: v.array(
    v.object({
      method: v.string(),
      status: v.pipe(v.number(), v.integer()),
      url: v.string(),
    }),
  ),
});
const WalletTransactionSchema = v.object({
  id: PositiveIntegerSchema,
  company_id: v.optional(PositiveIntegerSchema),
  description: v.string(),
  entry_side_str: v.picklist(["income", "expense"]),
  get_received_amount: v.number(),
  get_spent_amount: v.number(),
  ocean_external_account: v.optional(
    v.object({
      company_id: PositiveIntegerSchema,
    }),
  ),
  status: v.number(),
  status_str: v.string(),
  wallet_txn_recover_lock: v.optional(v.boolean()),
  suggestion: v.optional(v.unknown()),
  suggest_event: v.optional(v.unknown()),
  suggest_log_v3: v.optional(v.unknown()),
  txn_date: v.string(),
  updated_at: v.string(),
  walletable_id: PositiveIntegerSchema,
  walletable_name: NonEmptyStringSchema,
  deal_standards: v.optional(
    v.array(
      v.object({
        id: PositiveIntegerSchema,
      }),
    ),
  ),
  deal_transfers: v.optional(
    v.array(
      v.object({
        id: PositiveIntegerSchema,
      }),
    ),
  ),
});

const RegistrationPreviewLineSchema = v.object({
  account_item_name: v.nullable(v.string()),
  amount: v.number(),
  tax_name: v.nullable(v.string()),
});
const RegistrationPreviewSchema = v.object({
  models: v.pipe(
    v.array(
      v.object({
        txn_date: v.string(),
        debits: v.array(RegistrationPreviewLineSchema),
        credits: v.array(RegistrationPreviewLineSchema),
        rows: v.pipe(v.number(), v.integer(), v.minValue(1)),
      }),
    ),
    v.minLength(1),
  ),
});

const RegistrationResultSchema = v.object({
  wallet_txn: v.object({
    id: PositiveIntegerSchema,
    status: v.literal(2),
  }),
});

const AutoRuleResultSchema = v.object({
  wallet_txn_ids: v.array(PositiveIntegerSchema),
});
const AutoRuleMatchCountSchema = v.object({
  info: v.object({
    matchCount: v.pipe(v.number(), v.integer(), v.minValue(0)),
    tooManyUnreconciledWalletTxns: v.boolean(),
  }),
});
const TimestampSchema = v.pipe(v.string(), v.isoTimestamp());
const WalletableTypeSchema = v.picklist(["bank_account", "credit_card", "wallet"]);
const WalletableSyncStateSchema = v.object({
  walletable_status: NonEmptyStringSchema,
  last_synced_at: v.nullable(TimestampSchema),
  sync_failed_reason: v.nullable(NonEmptyStringSchema),
});
const WalletableSummaryItemSchema = v.object({
  walletable_id: PositiveIntegerSchema,
  name: NonEmptyStringSchema,
  walletable_type: WalletableTypeSchema,
  walletable_status: NonEmptyStringSchema,
  last_synced_at: v.nullable(TimestampSchema),
  connected_service_id: v.nullable(PositiveIntegerSchema),
  is_sync_frequency_limited: v.nullable(v.boolean()),
  sync_failed_reason: v.nullable(NonEmptyStringSchema),
});
const WalletableSummarySchema = v.object({
  walletables: v.array(WalletableSummaryItemSchema),
  summary: v.object({
    has_syncing: v.boolean(),
    available_sync_all: v.boolean(),
    ready_to_sync_all: v.boolean(),
  }),
});
const WalletableSyncStartedSchema = v.object({});

type FreeeWebResponse = v.InferOutput<typeof FreeeWebResponseSchema>;
type FreeeWebRequest = (input: {
  effect: "read" | "preview" | "write";
  method: "GET" | "POST" | "PUT";
  path: `/${string}`;
  body?: unknown;
}) => Promise<FreeeWebResponse>;

export type FreeeWebWalletTransaction = {
  id: number;
  companyId: number;
  date: string;
  description: string;
  entrySide: "income" | "expense";
  receivedAmount: number;
  spentAmount: number;
  status: number;
  statusName: string;
  recoveryLocked: boolean;
  updatedAt: string;
  walletableId: number;
  walletableName: string;
  dealIds: number[];
  transferIds: number[];
  suggestionContext: {
    suggestion?: unknown;
    suggestEvent?: unknown;
    suggestLogV3?: unknown;
  };
};

export type FreeeWebWalletableType = v.InferOutput<typeof WalletableTypeSchema>;

export type FreeeWebWalletable = {
  id: number;
  name: string;
  type: FreeeWebWalletableType;
  status: string;
  lastSyncedAt: string | null;
  connectedServiceId: number | null;
  isSyncFrequencyLimited: boolean | null;
  syncFailedReason: string | null;
};

export type FreeeWebWalletableSummary = {
  walletables: FreeeWebWalletable[];
  hasSyncing: boolean;
  canSyncAll: boolean;
  readyToSyncAll: boolean;
};

export type FreeeWebWalletableSyncState = Pick<
  FreeeWebWalletable,
  "status" | "lastSyncedAt" | "syncFailedReason"
>;

export type FreeeWebJournalPreview = {
  date: string;
  rows: number;
  debits: Array<{
    accountItemName: string | null;
    taxName: string | null;
    amount: number;
  }>;
  credits: Array<{
    accountItemName: string | null;
    taxName: string | null;
    amount: number;
  }>;
};

export type FreeeWebRegistration = {
  walletTransaction: FreeeWebWalletTransaction;
  lines: Array<{
    accountItemName: string;
    taxName: string;
    amount: number;
    description: string;
  }>;
};

export type FreeeWebOperations = {
  walletTransaction(id: number): Promise<FreeeWebWalletTransaction>;
  previewWalletTransactionRegistration(
    registration: FreeeWebRegistration,
  ): Promise<FreeeWebJournalPreview>;
  registerWalletTransaction(
    registration: FreeeWebRegistration,
  ): Promise<{ walletTransactionId: number }>;
  previewWalletTransactionSettlement(input: {
    walletTransaction: FreeeWebWalletTransaction;
    dealId: number;
    amount: number;
  }): Promise<FreeeWebJournalPreview[]>;
  settleWalletTransaction(input: {
    walletTransaction: FreeeWebWalletTransaction;
    dealId: number;
    amount: number;
  }): Promise<{ walletTransactionId: number }>;
  previewWalletTransactionTransfer(input: {
    walletTransaction: FreeeWebWalletTransaction;
    counterpartyWalletableName: string;
    description: string;
  }): Promise<FreeeWebJournalPreview>;
  registerWalletTransactionTransfer(input: {
    walletTransaction: FreeeWebWalletTransaction;
    counterpartyWalletableName: string;
    description: string;
  }): Promise<{ walletTransactionId: number }>;
  ignoreWalletTransaction(
    walletTransaction: FreeeWebWalletTransaction,
  ): Promise<{ walletTransactionId: number }>;
  restoreIgnoredWalletTransaction(
    walletTransaction: FreeeWebWalletTransaction,
  ): Promise<{ walletTransactionId: number }>;
  inspectInvoiceDealRegistration(invoiceId: number): Promise<void>;
  registerInvoiceDeal(invoiceId: number): Promise<void>;
  autoRegistrationRuleMatchCount(): Promise<{
    matchCount: number;
    tooManyUnreconciledWalletTransactions: boolean;
  }>;
  applyAutoRegistrationRules(): Promise<{ walletTransactionIds: number[] }>;
  walletableSummary(): Promise<FreeeWebWalletableSummary>;
  startWalletableSync(type: FreeeWebWalletableType, id: number): Promise<void>;
  walletableSyncState(
    type: FreeeWebWalletableType,
    id: number,
  ): Promise<FreeeWebWalletableSyncState>;
  startBulkWalletableSync(): Promise<void>;
};

export type FreeeWebScope = {
  companyId: number;
  authProfile: string;
};

async function freeeSessionState(browser: AgentBrowserSession) {
  return v.parse(
    FreeeSessionStateSchema,
    JSON.parse(
      await browser.evaluate(
        `JSON.stringify({ origin: location.origin, companyId: Number(document.querySelector('meta[name="current_company_id"],meta[name="company-id"]')?.getAttribute('content') ?? 0) })`,
      ),
    ),
  );
}

async function currentOrigin(browser: AgentBrowserSession): Promise<string> {
  return v.parse(
    v.object({ origin: v.string() }),
    JSON.parse(await browser.evaluate("JSON.stringify({ origin: location.origin })")),
  ).origin;
}

async function invoiceSessionState(browser: AgentBrowserSession) {
  return v.parse(
    FreeeSessionStateSchema,
    JSON.parse(
      await browser.evaluate(
        `(async () => JSON.stringify({ origin: location.origin, companyId: Number((await fetch('/api/p/app_state', { credentials: 'include' }).then(response => response.json())).company?.id ?? 0) }))()`,
      ),
    ),
  );
}

async function ensureFreeeSession(
  browser: AgentBrowserSession,
  companyId: number,
  authProfile: string,
): Promise<void> {
  await browser.run(["open", FREEE_LOGIN_URL]);
  let state = await freeeSessionState(browser);
  if (state.origin !== FREEE_ORIGIN) {
    try {
      await browser.run(["auth", "login", authProfile]);
      await browser.run(["open", FREEE_LOGIN_URL]);
      state = await freeeSessionState(browser);
    } catch (error) {
      throw new Error(
        agentBrowserFailureMessage(
          error instanceof Error ? error.message : String(error),
          authProfile,
          browser,
        ),
        { cause: error },
      );
    }
  }
  if (state.origin !== FREEE_ORIGIN) {
    throw new Error(agentBrowserFailureMessage("FREEE_LOGIN_REQUIRED", authProfile, browser));
  }
  if (state.companyId !== companyId) {
    throw new Error(agentBrowserFailureMessage("FREEE_COMPANY_MISMATCH", authProfile, browser));
  }
}

async function ensureInvoiceSession(
  browser: AgentBrowserSession,
  companyId: number,
  invoiceId: number,
  authProfile: string,
): Promise<void> {
  const url = `${FREEE_INVOICE_ORIGIN}/reports/invoices/${invoiceId}/accounting`;
  await browser.run(["open", url]);
  let origin = await currentOrigin(browser);
  if (origin !== FREEE_INVOICE_ORIGIN) {
    await browser.run(["auth", "login", authProfile]);
    await browser.run(["open", url]);
    origin = await currentOrigin(browser);
  }
  if (origin !== FREEE_INVOICE_ORIGIN) {
    throw new Error(agentBrowserFailureMessage("FREEE_LOGIN_REQUIRED", authProfile, browser));
  }
  const state = await invoiceSessionState(browser);
  if (state.companyId !== companyId) {
    throw new Error(agentBrowserFailureMessage("FREEE_COMPANY_MISMATCH", authProfile, browser));
  }
}

function buildRequestJavaScript(companyId: number, input: Parameters<FreeeWebRequest>[0]): string {
  const method = JSON.stringify(input.method);
  const path = JSON.stringify(input.path);
  const body = input.body === undefined ? "null" : JSON.stringify(input.body);
  const companyCheck = `
  const currentCompanyId = Number(document
    .querySelector('meta[name="current_company_id"],meta[name="company-id"]')
    ?.getAttribute("content") ?? 0);
  if (currentCompanyId !== ${companyId}) {
    throw new Error("FREEE_COMPANY_MISMATCH");
  }`;
  const csrfSetup =
    input.method === "GET"
      ? ""
      : `
    const csrfToken = document
      .querySelector('meta[name="csrf-token"]')
      ?.getAttribute("content");
    if (!csrfToken) throw new Error("freee CSRF token is unavailable");
    headers.set("X-CSRF-Token", csrfToken);
    headers.set(
      "Content-Type",
      ${input.body === undefined ? '"application/x-www-form-urlencoded; charset=UTF-8"' : '"application/json"'},
    );`;
  const requestBody = input.body === undefined ? "" : `,\n    body: JSON.stringify(${body})`;

  // Why: browser credentials remain inside the authenticated freee tab.
  return `(async () => {
  if (location.origin !== "${FREEE_ORIGIN}") {
    throw new Error("Unexpected freee origin");
  }${companyCheck}
  const headers = new Headers({ Accept: "application/json" });${csrfSetup}
  const response = await fetch(${path}, {
    method: ${method},
    headers,
    credentials: "same-origin"${requestBody}
  });
  return JSON.stringify({
    origin: location.origin,
    status: response.status,
    body: await response.text(),
  });
})()`;
}

async function runAgentBrowserRequest(
  browser: AgentBrowserSession,
  companyId: number,
  input: Parameters<FreeeWebRequest>[0],
): Promise<FreeeWebResponse> {
  try {
    return v.parse(
      FreeeWebResponseSchema,
      JSON.parse(await browser.evaluate(buildRequestJavaScript(companyId, input))),
    );
  } catch (error) {
    if (input.effect === "write" && !isPreDispatchFailure(error)) {
      throw new OutcomeUnknownError("freee Web write confirmation was lost.", { cause: error });
    }
    throw error;
  }
}

function isPreDispatchFailure(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return [
    "Unexpected freee origin",
    "FREEE_COMPANY_MISMATCH",
    "freee CSRF token is unavailable",
  ].some((message) => error.message.includes(message));
}

function agentBrowserFailureMessage(
  rawMessage: string,
  authProfile: string,
  browser?: AgentBrowserSession,
): string {
  const message = rawMessage.trim();
  if (
    message.includes("FREEE_LOGIN_REQUIRED") ||
    message.includes("auth profile") ||
    message.includes("Auth profile")
  ) {
    return `Agent Browserにfreee認証を保存してください: agent-browser auth save ${authProfile} --url ${FREEE_LOGIN_URL} --username <メールアドレス> --password-stdin`;
  }
  if (message.includes("FREEE_COMPANY_MISMATCH")) {
    const openCommand = browser
      ? `agent-browser --namespace ${browser.namespace} --session ${browser.sessionId} --restore --headed open "${FREEE_LOGIN_URL}"`
      : "Agent Browserの対象セッション";
    return `${openCommand}で対象事業所を選択してから再実行してください。対象事業所が表示されない場合は、アクセスできるfreee Webログインを別名のAuth Profileへ保存し、そのAuth Profileを指定して再実行してください。現在のAuth Profileは${authProfile}です`;
  }
  if (message.includes("freee CSRF token is unavailable")) {
    return "Agent Browserのfreeeセッションを再読み込みしてから再実行してください";
  }
  if (message.includes("timed out")) return "Agent Browserのfreee通信がタイムアウトしました";
  return message || "Agent Browserでfreeeを操作できませんでした";
}

function parseResponse<TSchema extends v.BaseSchema<unknown, unknown, v.BaseIssue<unknown>>>(
  schema: TSchema,
  response: FreeeWebResponse,
  authProfile: string,
): v.InferOutput<TSchema> {
  assertSuccessfulResponse(response, authProfile);
  return v.parse(schema, JSON.parse(response.body));
}

function parseWriteResponse<TSchema extends v.BaseSchema<unknown, unknown, v.BaseIssue<unknown>>>(
  schema: TSchema,
  response: FreeeWebResponse,
  authProfile: string,
): v.InferOutput<TSchema> {
  assertSuccessfulWriteResponse(response, authProfile);
  try {
    return v.parse(schema, JSON.parse(response.body));
  } catch (error) {
    throw new OutcomeUnknownError("freee Web accepted the write but its result was unreadable.", {
      cause: error,
    });
  }
}

function assertSuccessfulResponse(response: FreeeWebResponse, authProfile: string): void {
  if (response.status === 401 || response.status === 403) {
    throw new Error(agentBrowserFailureMessage("FREEE_LOGIN_REQUIRED", authProfile));
  }
  if (response.status < 200 || response.status >= 300) {
    throw new Error(`freee Web API returned HTTP ${response.status}`);
  }
}

function assertSuccessfulWriteResponse(response: FreeeWebResponse, authProfile: string): void {
  if (response.status >= 500) {
    throw new OutcomeUnknownError(
      `freee Web write returned HTTP ${response.status}; its outcome is unknown.`,
    );
  }
  assertSuccessfulResponse(response, authProfile);
}

function registrationPayload(registration: FreeeWebRegistration) {
  const walletTransaction = registration.walletTransaction;
  const newDeal = {
    payment_walletable: walletTransaction.walletableName,
    deal: {
      issue_date: walletTransaction.date,
      partner_name: "" as const,
      line_items: registration.lines.map((line) => ({
        account_item_name: line.accountItemName,
        tax_name: line.taxName,
        item_name: null,
        section_name: null,
        default_tags: [] as [],
        tax_entry_method: 1 as const,
        unit_price: line.amount,
        description: line.description,
        division_tag_1_id: null,
        division_tag_2_id: null,
        division_tag_3_id: null,
      })),
    },
  };
  return {
    reconcile: {
      wallet_txn_id: walletTransaction.id,
      new_deal: newDeal,
      existing_deals: [] as [],
    },
  };
}

function journalPreview(
  value: v.InferOutput<typeof RegistrationPreviewSchema>,
): FreeeWebJournalPreview[] {
  const normalize = (line: v.InferOutput<typeof RegistrationPreviewLineSchema>) => ({
    accountItemName: line.account_item_name,
    taxName: line.tax_name,
    amount: line.amount,
  });
  return value.models.map((model) => ({
    date: model.txn_date,
    rows: model.rows,
    debits: model.debits.map(normalize),
    credits: model.credits.map(normalize),
  }));
}

function singleJournalPreview(
  value: v.InferOutput<typeof RegistrationPreviewSchema>,
  errorMessage: string,
): FreeeWebJournalPreview {
  const previews = journalPreview(value);
  const [preview] = previews;
  if (previews.length !== 1 || !preview) throw new Error(errorMessage);
  return preview;
}

function reconcileWriteBody(
  walletTransaction: FreeeWebWalletTransaction,
  payload: Record<string, unknown>,
) {
  return {
    ...payload,
    suggestion: walletTransaction.suggestionContext.suggestion,
    suggest_event: walletTransaction.suggestionContext.suggestEvent,
    suggest_log_v3: walletTransaction.suggestionContext.suggestLogV3,
    skip_saving_matcher: true,
    reconciled_time: 0,
    reconciled_from: "stream_detail",
    from: "new_version",
  };
}

function settlementPayload(input: {
  walletTransaction: FreeeWebWalletTransaction;
  dealId: number;
  amount: number;
}) {
  return {
    reconcile: {
      wallet_txn_id: input.walletTransaction.id,
      existing_deals: [{ deal_id: input.dealId, amount: input.amount }],
    },
  };
}

function transferPayload(input: {
  walletTransaction: FreeeWebWalletTransaction;
  counterpartyWalletableName: string;
  description: string;
}) {
  const walletTransaction = input.walletTransaction;
  const amount = walletTransaction.receivedAmount || walletTransaction.spentAmount;
  const income = walletTransaction.entrySide === "income";
  return {
    date: walletTransaction.date,
    transfer_lines: [
      {
        amount,
        walletable_from: income
          ? input.counterpartyWalletableName
          : walletTransaction.walletableName,
        walletable_to: income ? walletTransaction.walletableName : input.counterpartyWalletableName,
        description: input.description,
      },
    ],
  };
}

function walletable(value: v.InferOutput<typeof WalletableSummaryItemSchema>): FreeeWebWalletable {
  return {
    id: value.walletable_id,
    name: value.name,
    type: value.walletable_type,
    status: value.walletable_status,
    lastSyncedAt: value.last_synced_at,
    connectedServiceId: value.connected_service_id,
    isSyncFrequencyLimited: value.is_sync_frequency_limited,
    syncFailedReason: value.sync_failed_reason,
  };
}

function createFreeeWebOperations(input: {
  companyId: number;
  authProfile: string;
  request: FreeeWebRequest;
  inspectInvoiceDealRegistration: (invoiceId: number) => Promise<void>;
  registerInvoiceDeal: (invoiceId: number) => Promise<void>;
}): FreeeWebOperations {
  const request = input.request;
  const parse = <TSchema extends v.BaseSchema<unknown, unknown, v.BaseIssue<unknown>>>(
    schema: TSchema,
    response: FreeeWebResponse,
  ) => parseResponse(schema, response, input.authProfile);
  const parseWrite = <TSchema extends v.BaseSchema<unknown, unknown, v.BaseIssue<unknown>>>(
    schema: TSchema,
    response: FreeeWebResponse,
  ) => parseWriteResponse(schema, response, input.authProfile);
  const assertSuccessfulWrite = (response: FreeeWebResponse) =>
    assertSuccessfulWriteResponse(response, input.authProfile);
  const assertWalletTransactionScope = (walletTransaction: FreeeWebWalletTransaction) => {
    if (walletTransaction.companyId !== input.companyId) {
      throw new Error(
        `取引${walletTransaction.id}の事業所${walletTransaction.companyId}は対象事業所${input.companyId}と一致しません`,
      );
    }
  };
  return {
    async walletTransaction(id) {
      const value = parse(
        WalletTransactionSchema,
        await request({ effect: "read", method: "GET", path: `/api/p/wallet_txns/${id}` }),
      );
      return {
        id: value.id,
        companyId: value.ocean_external_account?.company_id ?? value.company_id ?? input.companyId,
        date: value.txn_date,
        description: value.description,
        entrySide: value.entry_side_str,
        receivedAmount: value.get_received_amount,
        spentAmount: value.get_spent_amount,
        status: value.status,
        statusName: value.status_str,
        recoveryLocked: value.wallet_txn_recover_lock ?? false,
        updatedAt: value.updated_at,
        walletableId: value.walletable_id,
        walletableName: value.walletable_name,
        dealIds: value.deal_standards?.map(({ id: dealId }) => dealId) ?? [],
        transferIds: value.deal_transfers?.map(({ id: transferId }) => transferId) ?? [],
        suggestionContext: {
          suggestion: value.suggestion,
          suggestEvent: value.suggest_event,
          suggestLogV3: value.suggest_log_v3,
        },
      };
    },

    async previewWalletTransactionRegistration(registration) {
      assertWalletTransactionScope(registration.walletTransaction);
      const payload = registrationPayload(registration);
      const value = parse(
        RegistrationPreviewSchema,
        await request({
          effect: "preview",
          method: "POST",
          path: `/api/p/wallet_txns/${registration.walletTransaction.id}/previews/standard`,
          body: { ...payload, from: "new_version" },
        }),
      );
      return singleJournalPreview(value, "freeeの仕訳previewを一意に確認できません");
    },

    async registerWalletTransaction(registration) {
      const walletTransaction = registration.walletTransaction;
      assertWalletTransactionScope(walletTransaction);
      const payload = registrationPayload(registration);
      const value = parseWrite(
        RegistrationResultSchema,
        await request({
          effect: "write",
          method: "PUT",
          path: `/api/p/wallet_txns/${walletTransaction.id}/reconcile`,
          body: reconcileWriteBody(walletTransaction, payload),
        }),
      );
      return { walletTransactionId: value.wallet_txn.id };
    },

    async previewWalletTransactionSettlement(settlement) {
      assertWalletTransactionScope(settlement.walletTransaction);
      const value = parse(
        RegistrationPreviewSchema,
        await request({
          effect: "preview",
          method: "POST",
          path: `/api/p/wallet_txns/${settlement.walletTransaction.id}/previews/scrub`,
          body: { ...settlementPayload(settlement), from: "new_version" },
        }),
      );
      return journalPreview(value);
    },

    async settleWalletTransaction(settlement) {
      const walletTransaction = settlement.walletTransaction;
      assertWalletTransactionScope(walletTransaction);
      const value = parseWrite(
        RegistrationResultSchema,
        await request({
          effect: "write",
          method: "PUT",
          path: `/api/p/wallet_txns/${walletTransaction.id}/reconcile`,
          body: reconcileWriteBody(walletTransaction, settlementPayload(settlement)),
        }),
      );
      return { walletTransactionId: value.wallet_txn.id };
    },

    async previewWalletTransactionTransfer(transfer) {
      assertWalletTransactionScope(transfer.walletTransaction);
      const value = parse(
        RegistrationPreviewSchema,
        await request({
          effect: "preview",
          method: "POST",
          path: `/api/p/wallet_txns/${transfer.walletTransaction.id}/previews/transfer`,
          body: { ...transferPayload(transfer), from: "new_version" },
        }),
      );
      return singleJournalPreview(value, "freeeの口座振替previewを一意に確認できません");
    },

    async registerWalletTransactionTransfer(transfer) {
      const walletTransaction = transfer.walletTransaction;
      assertWalletTransactionScope(walletTransaction);
      const value = parseWrite(
        RegistrationResultSchema,
        await request({
          effect: "write",
          method: "PUT",
          path: `/api/p/wallet_txns/${walletTransaction.id}/reconcile`,
          body: reconcileWriteBody(walletTransaction, transferPayload(transfer)),
        }),
      );
      return { walletTransactionId: value.wallet_txn.id };
    },

    async ignoreWalletTransaction(walletTransaction) {
      assertWalletTransactionScope(walletTransaction);
      assertSuccessfulWrite(
        await request({
          effect: "write",
          method: "PUT",
          path: `/api/p/wallet_txns/${walletTransaction.id}/ignore`,
          body: {
            reconciled_time: 0,
            reconciled_from: "wallet_txns_index",
            suggest_log_v3: walletTransaction.suggestionContext.suggestLogV3,
          },
        }),
      );
      return { walletTransactionId: walletTransaction.id };
    },

    async restoreIgnoredWalletTransaction(walletTransaction) {
      assertWalletTransactionScope(walletTransaction);
      assertSuccessfulWrite(
        await request({
          effect: "write",
          method: "PUT",
          path: `/api/p/wallet_txns/${walletTransaction.id}/recover`,
        }),
      );
      return { walletTransactionId: walletTransaction.id };
    },

    inspectInvoiceDealRegistration: input.inspectInvoiceDealRegistration,
    registerInvoiceDeal: input.registerInvoiceDeal,

    async autoRegistrationRuleMatchCount() {
      const value = parse(
        AutoRuleMatchCountSchema,
        await request({ effect: "read", method: "GET", path: "/wallet_txns/match_count" }),
      );
      return {
        matchCount: value.info.matchCount,
        tooManyUnreconciledWalletTransactions: value.info.tooManyUnreconciledWalletTxns,
      };
    },

    async applyAutoRegistrationRules() {
      const value = parseWrite(
        AutoRuleResultSchema,
        await request({ effect: "write", method: "POST", path: "/wallet_txns/bulk_match" }),
      );
      return { walletTransactionIds: value.wallet_txn_ids };
    },

    async walletableSummary() {
      const value = parse(
        WalletableSummarySchema,
        await request({ effect: "read", method: "GET", path: "/api/p/v2/walletables/summary" }),
      );
      return {
        walletables: value.walletables.map(walletable),
        hasSyncing: value.summary.has_syncing,
        canSyncAll: value.summary.available_sync_all,
        readyToSyncAll: value.summary.ready_to_sync_all,
      };
    },

    async startWalletableSync(type, id) {
      parseWrite(
        WalletableSyncStartedSchema,
        await request({
          effect: "write",
          method: "PUT",
          path: `/api/p/v2/walletables/${type}/${id}/sync`,
        }),
      );
    },

    async walletableSyncState(type, id) {
      const value = parse(
        WalletableSyncStateSchema,
        await request({
          effect: "read",
          method: "GET",
          path: `/api/p/v2/walletables/${type}/${id}/sync_status`,
        }),
      );
      return {
        status: value.walletable_status,
        lastSyncedAt: value.last_synced_at,
        syncFailedReason: value.sync_failed_reason,
      };
    },

    async startBulkWalletableSync() {
      parseWrite(
        WalletableSyncStartedSchema,
        await request({
          effect: "write",
          method: "PUT",
          path: "/api/p/v2/walletables/sync_all",
        }),
      );
    },
  };
}

export async function withFreeeWeb<T>(
  scope: FreeeWebScope,
  run: (web: FreeeWebOperations) => Promise<T>,
): Promise<T> {
  const { companyId, authProfile } = scope;
  if (!Number.isInteger(companyId) || companyId < 1) {
    throw new Error("freee事業所IDが不正です");
  }
  if (!/^[A-Za-z0-9_-]+$/.test(authProfile)) {
    throw new Error("freee Auth Profileが不正です");
  }
  const browserSession = await createAgentBrowserSession({
    namespace: AGENT_BROWSER_NAMESPACE,
    sessionPrefix: "fb",
    companyId,
    authProfile,
    environment: Bun.env,
  });
  try {
    await ensureFreeeSession(browserSession, companyId, authProfile);
  } catch (error) {
    try {
      await browserSession.dispose();
    } catch {
      // Preserve the actionable authentication or company error.
    }
    throw error;
  }
  let accountingSessionReady = true;
  const ensureAccountingSession = async () => {
    if (accountingSessionReady) return;
    await ensureFreeeSession(browserSession, companyId, authProfile);
    accountingSessionReady = true;
  };
  const openInvoiceDealRegistration = async (invoiceId: number) => {
    await ensureInvoiceSession(browserSession, companyId, invoiceId, authProfile);
    accountingSessionReady = false;
  };
  const inspectInvoiceDealRegistration = async (invoiceId: number) => {
    await openInvoiceDealRegistration(invoiceId);
    try {
      await browserSession.run(["find", "role", "button", "text", "--name", "取引登録", "--exact"]);
    } catch (error) {
      throw new Error(`freee Web does not offer Deal registration for invoice ${invoiceId}.`, {
        cause: error,
      });
    }
  };
  const registerInvoiceDeal = async (invoiceId: number) => {
    await openInvoiceDealRegistration(invoiceId);
    await browserSession.evaluate("performance.clearResourceTimings()");
    await browserSession.run(["network", "requests", "--clear"]);
    const saveUrl = `${FREEE_INVOICE_ORIGIN}/api/p/reports/invoices/${invoiceId}/accounting/deals`;
    let interactionError: unknown;
    try {
      await browserSession.run([
        "find",
        "role",
        "button",
        "click",
        "--name",
        "取引登録",
        "--exact",
      ]);
      await browserSession.run([
        "wait",
        "--fn",
        `performance.getEntriesByName(${JSON.stringify(saveUrl)}).some(entry => entry.responseEnd > 0)`,
      ]);
    } catch (error) {
      interactionError = error;
    }
    let observed: v.InferOutput<typeof AgentBrowserNetworkRequestsSchema>;
    try {
      observed = v.parse(
        AgentBrowserNetworkRequestsSchema,
        await browserSession.run(["network", "requests", "--filter", saveUrl, "--method", "POST"]),
      );
    } catch (error) {
      throw new OutcomeUnknownError("freee invoice registration confirmation was lost.", {
        cause:
          interactionError === undefined
            ? error
            : new AggregateError(
                [interactionError, error],
                "Invoice registration was not observed.",
              ),
      });
    }
    const matching = observed.requests.filter(
      (request) => request.url === saveUrl && request.method === "POST",
    );
    if (matching.some(({ status }) => status >= 200 && status < 300)) return;
    const failed = matching.at(-1);
    if (failed) {
      if (failed.status >= 500 || failed.status < 100) {
        throw new OutcomeUnknownError(
          `freee invoice registration returned HTTP ${failed.status}; its outcome is unknown.`,
        );
      }
      throw new Error(`freee invoice Deal registration returned HTTP ${failed.status}.`);
    }
    throw new OutcomeUnknownError("freee invoice registration completion was not confirmed.", {
      cause: interactionError,
    });
  };
  const web = createFreeeWebOperations({
    companyId,
    authProfile,
    request: async (input) => {
      await ensureAccountingSession();
      return runAgentBrowserRequest(browserSession, companyId, input);
    },
    inspectInvoiceDealRegistration,
    registerInvoiceDeal,
  });
  const outcome = await run(web).then(
    (value) => ({ success: true as const, value }),
    (error: unknown) => ({ success: false as const, error }),
  );
  try {
    await browserSession.dispose();
  } catch {
    // A completed freee write must not look retryable because browser cleanup failed.
  }
  if (!outcome.success) throw outcome.error;
  return outcome.value;
}
