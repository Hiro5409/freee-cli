import * as v from "valibot";

import { CliError, OutcomeUnknownError } from "../../errors.ts";
import {
  createAgentBrowserSession,
  clearAgentBrowserSession,
  type AgentBrowserSession,
} from "./agent-browser.ts";

export { OutcomeUnknownError } from "../../errors.ts";

const FREEE_ORIGIN = "https://secure.freee.co.jp";
const FREEE_INVOICE_ORIGIN = "https://invoice.secure.freee.co.jp";
const FREEE_LOGIN_URL = `${FREEE_ORIGIN}/`;
const AGENT_BROWSER_NAMESPACE = "freee-web";

const PositiveIntegerSchema = v.pipe(v.number(), v.integer(), v.minValue(1));
const NonEmptyStringSchema = v.pipe(v.string(), v.trim(), v.minLength(1));

const FreeeWebResponseSchema = v.object({
  origin: v.picklist([FREEE_ORIGIN, FREEE_INVOICE_ORIGIN]),
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
  effect: "read" | "write";
  method: "GET" | "POST" | "PUT";
  path: `/${string}`;
  body?: unknown;
}) => Promise<FreeeWebResponse>;

export type FreeeWebWalletableType = v.InferOutput<typeof WalletableTypeSchema>;

export type InvoiceSendingStatus = "sent" | "unsent";

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

export type FreeeWebOperations = {
  registerInvoiceDeal(invoiceId: number): Promise<void>;
  setInvoiceSendingStatus(invoiceId: number, status: InvoiceSendingStatus): Promise<void>;
  walletableSummary(): Promise<FreeeWebWalletableSummary>;
  startWalletableSync(type: FreeeWebWalletableType, id: number): Promise<void>;
  walletableSyncState(
    type: FreeeWebWalletableType,
    id: number,
  ): Promise<FreeeWebWalletableSyncState>;
  startBulkWalletableSync(): Promise<void>;
};

export type FreeeWebScope = {
  profile: string;
  companyId: number;
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
  profile: string,
): Promise<void> {
  await browser.run(["open", FREEE_LOGIN_URL]);
  const state = await freeeSessionState(browser);
  if (state.origin !== FREEE_ORIGIN || state.companyId === 0) {
    throw new Error(agentBrowserFailureMessage("FREEE_LOGIN_REQUIRED", profile));
  }
  if (state.companyId !== companyId) {
    throw new Error(agentBrowserFailureMessage("FREEE_COMPANY_MISMATCH", profile));
  }
}

async function ensureInvoiceSession(
  browser: AgentBrowserSession,
  companyId: number,
  invoiceId: number,
  profile: string,
  page: "accounting" | "details" = "accounting",
): Promise<void> {
  const suffix = page === "accounting" ? "/accounting" : "";
  const url = `${FREEE_INVOICE_ORIGIN}/reports/invoices/${invoiceId}${suffix}`;
  await browser.run(["open", url]);
  const origin = await currentOrigin(browser);
  if (origin !== FREEE_INVOICE_ORIGIN) {
    throw new Error(agentBrowserFailureMessage("FREEE_LOGIN_REQUIRED", profile));
  }
  const state = await invoiceSessionState(browser);
  if (state.companyId !== companyId) {
    throw new Error(agentBrowserFailureMessage("FREEE_COMPANY_MISMATCH", profile));
  }
}

function buildInvoiceSetSendingStatusJavaScript(
  companyId: number,
  invoiceId: number,
  status: InvoiceSendingStatus,
): string {
  const body = JSON.stringify({
    deliver_status: status === "sent" ? "delivered" : "undelivered",
  });
  return `(async () => {
  if (location.origin !== "${FREEE_INVOICE_ORIGIN}") {
    throw new Error("Unexpected freee origin");
  }
  const appStateResponse = await fetch("/api/p/app_state", { credentials: "same-origin" });
  const appState = await appStateResponse.json();
  if (Number(appState.company?.id ?? 0) !== ${companyId}) {
    throw new Error("FREEE_COMPANY_MISMATCH");
  }
  const csrfToken = document
    .querySelector('meta[name="csrf-token"]')
    ?.getAttribute("content");
  if (!csrfToken) throw new Error("freee CSRF token is unavailable");
  const headers = new Headers({ Accept: "application/json" });
  headers.set("Content-Type", "application/json");
  headers.set("X-CSRF-Token", csrfToken);
  headers.set("X-Company-Id", "${companyId}");
  headers.set("x-freee-client-name", "invoice");
  const response = await fetch("/api/p/reports/invoices/${invoiceId}/deliver_status", {
    method: "PUT",
    headers,
    credentials: "same-origin",
    body: JSON.stringify(${body})
  });
  return JSON.stringify({
    origin: location.origin,
    status: response.status,
    body: await response.text(),
  });
})()`;
}

async function runInvoiceSetSendingStatusRequest(
  browser: AgentBrowserSession,
  companyId: number,
  invoiceId: number,
  status: InvoiceSendingStatus,
): Promise<FreeeWebResponse> {
  try {
    return v.parse(
      FreeeWebResponseSchema,
      JSON.parse(
        await browser.evaluate(
          buildInvoiceSetSendingStatusJavaScript(companyId, invoiceId, status),
        ),
      ),
    );
  } catch (error) {
    if (!isPreDispatchFailure(error)) {
      throw new OutcomeUnknownError("freee invoice status confirmation was lost.", {
        cause: error,
      });
    }
    throw error;
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

  // Browser credentials remain inside the authenticated freee tab.
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

function agentBrowserFailureMessage(rawMessage: string, profile: string): string {
  const message = rawMessage.trim();
  const login = `freee auth login --web --profile ${profile}`;
  if (message.includes("FREEE_LOGIN_REQUIRED")) {
    return `freee Webのログインが必要です。${login} を実行してください。`;
  }
  if (message.includes("FREEE_COMPANY_MISMATCH")) {
    return `freee Webの事業所が対象と一致しません。${login} で対象事業所を選択してください。`;
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
  profile: string,
): v.InferOutput<TSchema> {
  assertSuccessfulResponse(response, profile);
  return v.parse(schema, JSON.parse(response.body));
}

function parseWriteResponse<TSchema extends v.BaseSchema<unknown, unknown, v.BaseIssue<unknown>>>(
  schema: TSchema,
  response: FreeeWebResponse,
  profile: string,
): v.InferOutput<TSchema> {
  assertSuccessfulWriteResponse(response, profile);
  try {
    return v.parse(schema, JSON.parse(response.body));
  } catch (error) {
    throw new OutcomeUnknownError("freee Web accepted the write but its result was unreadable.", {
      cause: error,
    });
  }
}

function assertSuccessfulResponse(response: FreeeWebResponse, profile: string): void {
  if (response.status === 401 || response.status === 403) {
    throw new Error(agentBrowserFailureMessage("FREEE_LOGIN_REQUIRED", profile));
  }
  if (response.status < 200 || response.status >= 300) {
    throw new Error(`freee Web API returned HTTP ${response.status}`);
  }
}

function assertSuccessfulWriteResponse(response: FreeeWebResponse, profile: string): void {
  if (response.status >= 500) {
    throw new OutcomeUnknownError(
      `freee Web write returned HTTP ${response.status}; its outcome is unknown.`,
    );
  }
  assertSuccessfulResponse(response, profile);
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
  profile: string;
  request: FreeeWebRequest;
  registerInvoiceDeal: (invoiceId: number) => Promise<void>;
  setInvoiceSendingStatus: (invoiceId: number, status: InvoiceSendingStatus) => Promise<void>;
}): FreeeWebOperations {
  const request = input.request;
  const parse = <TSchema extends v.BaseSchema<unknown, unknown, v.BaseIssue<unknown>>>(
    schema: TSchema,
    response: FreeeWebResponse,
  ) => parseResponse(schema, response, input.profile);
  const parseWrite = <TSchema extends v.BaseSchema<unknown, unknown, v.BaseIssue<unknown>>>(
    schema: TSchema,
    response: FreeeWebResponse,
  ) => parseWriteResponse(schema, response, input.profile);
  return {
    registerInvoiceDeal: input.registerInvoiceDeal,
    setInvoiceSendingStatus: input.setInvoiceSendingStatus,

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

function createFreeeBrowser(scope: FreeeWebScope, headed = false): Promise<AgentBrowserSession> {
  const { companyId, profile } = scope;
  if (!Number.isInteger(companyId) || companyId < 1) {
    throw new Error("freee事業所IDが不正です");
  }
  if (!/^[A-Za-z0-9_-]+$/.test(profile)) {
    throw new Error("freee CLIプロファイルが不正です");
  }
  return createAgentBrowserSession({
    namespace: AGENT_BROWSER_NAMESPACE,
    sessionPrefix: "fb",
    companyId,
    profile,
    environment: Bun.env,
    headed,
    initializeEncryptionKey: headed,
  });
}

export async function logoutFreeeWeb(scope: FreeeWebScope): Promise<void> {
  await clearAgentBrowserSession({
    namespace: AGENT_BROWSER_NAMESPACE,
    sessionPrefix: "fb",
    ...scope,
  });
}

export async function loginFreeeWeb(scope: FreeeWebScope) {
  const browser = await createFreeeBrowser(scope, true);
  let verified = false;
  try {
    await browser.run(["open", FREEE_LOGIN_URL]);
    await browser.run(
      [
        "wait",
        "--fn",
        `location.origin === ${JSON.stringify(FREEE_ORIGIN)} && Number(document.querySelector('meta[name="current_company_id"],meta[name="company-id"]')?.getAttribute('content') ?? 0) === ${scope.companyId}`,
        "--timeout",
        "300000",
      ],
      { timeoutMs: 310_000 },
    );
    await ensureFreeeSession(browser, scope.companyId, scope.profile);
    verified = true;
    return { ...scope, status: "ready" as const };
  } catch (error) {
    if (error instanceof Error && /timed out/i.test(error.message)) {
      throw new CliError("freee Web login was not completed within five minutes.", {
        code: "AUTHENTICATION",
        exitCode: 2,
        cause: error,
        hint: `freee auth login --web --profile ${scope.profile}`,
      });
    }
    throw error;
  } finally {
    if (verified) await browser.dispose({ persist: true });
    else await browser.dispose().catch(() => undefined);
  }
}

export async function freeeWebStatus(scope: FreeeWebScope) {
  const browser = await createFreeeBrowser(scope);
  let verified = false;
  try {
    await browser.run(["open", FREEE_LOGIN_URL]);
    const state = await freeeSessionState(browser);
    const status =
      state.origin !== FREEE_ORIGIN || state.companyId === 0
        ? "login_required"
        : state.companyId !== scope.companyId
          ? "company_mismatch"
          : "ready";
    verified = status === "ready";
    return {
      status,
      actualCompanyId: state.companyId || null,
      ...(verified ? {} : { hint: `freee auth login --web --profile ${scope.profile}` }),
    };
  } finally {
    await browser.dispose({ persist: verified });
  }
}

export async function withFreeeWeb<T>(
  scope: FreeeWebScope,
  run: (web: FreeeWebOperations) => Promise<T>,
): Promise<T> {
  const { companyId, profile } = scope;
  const browserSession = await createFreeeBrowser(scope);
  try {
    await ensureFreeeSession(browserSession, companyId, profile);
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
    await ensureFreeeSession(browserSession, companyId, profile);
    accountingSessionReady = true;
  };
  const openInvoiceDealRegistration = async (invoiceId: number) => {
    await ensureInvoiceSession(browserSession, companyId, invoiceId, profile);
    accountingSessionReady = false;
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
  const openInvoiceDetails = async (invoiceId: number) => {
    await ensureInvoiceSession(browserSession, companyId, invoiceId, profile, "details");
    accountingSessionReady = false;
  };
  const setInvoiceSendingStatus = async (invoiceId: number, status: InvoiceSendingStatus) => {
    await openInvoiceDetails(invoiceId);
    const response = await runInvoiceSetSendingStatusRequest(
      browserSession,
      companyId,
      invoiceId,
      status,
    );
    assertSuccessfulWriteResponse(response, profile);
  };
  const web = createFreeeWebOperations({
    companyId,
    profile,
    request: async (input) => {
      await ensureAccountingSession();
      return runAgentBrowserRequest(browserSession, companyId, input);
    },
    registerInvoiceDeal,
    setInvoiceSendingStatus,
  });
  const outcome = await run(web).then(
    (value) => ({ success: true as const, value }),
    (error: unknown) => ({ success: false as const, error }),
  );
  try {
    await ensureFreeeSession(browserSession, companyId, profile);
    await browserSession.dispose({ persist: true });
  } catch {
    await browserSession.dispose().catch(() => undefined);
    // A completed freee write must not look retryable because session persistence failed.
  }
  if (!outcome.success) throw outcome.error;
  return outcome.value;
}
