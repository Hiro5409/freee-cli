import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { createHash, randomUUID } from "node:crypto";
import { createContext, runInContext } from "node:vm";

import { OutcomeUnknownError } from "../../errors.ts";
import {
  type FreeeWebRegistration,
  type FreeeWebScope,
  type FreeeWebWalletTransaction,
  withFreeeWeb,
} from "./freee-web.ts";

const companyId = 1_234_567;
let webScope: FreeeWebScope;
const invoiceOrigin = "https://invoice.secure.freee.co.jp";
const loginOrigin = "https://accounts.secure.freee.co.jp";
const csrfToken = "csrf-token-value";
const encryptionKey = "a".repeat(64);
const previousEncryptionKey = Bun.env.AGENT_BROWSER_ENCRYPTION_KEY;
const previousHome = Bun.env.HOME;
const previousUserProfile = Bun.env.USERPROFILE;

function expectedSessionId(prefix: string, scopedCompanyId: number, authProfile: string): string {
  const profileKey = createHash("sha256").update(authProfile).digest("hex").slice(0, 16);
  return `${prefix}-${scopedCompanyId}-${profileKey}`;
}

// Session locks live in a machine-wide directory, so each test owns its Auth Profile.
beforeEach(() => {
  webScope = { companyId, authProfile: `test-${randomUUID()}` };
});

afterEach(() => {
  if (previousEncryptionKey === undefined) delete Bun.env.AGENT_BROWSER_ENCRYPTION_KEY;
  else Bun.env.AGENT_BROWSER_ENCRYPTION_KEY = previousEncryptionKey;
  if (previousHome === undefined) delete Bun.env.HOME;
  else Bun.env.HOME = previousHome;
  if (previousUserProfile === undefined) delete Bun.env.USERPROFILE;
  else Bun.env.USERPROFILE = previousUserProfile;
});

type PageResponse = { status?: number; body?: unknown };
type PageRequest = {
  method: string;
  path: string;
  headers: Record<string, string>;
  body: unknown;
};
type FreeePage = {
  origin: string;
  meta: Record<string, string>;
  responses: Array<PageResponse | (() => PageResponse)>;
  requests: PageRequest[];
  resourceTimingClears: number;
};

// The page state that scripts sent to Agent Browser observe: where the tab is, which
// Company and CSRF token its document declares, and what the network answers in order.
function freeePage(responses: FreeePage["responses"] = []): FreeePage {
  return {
    origin: "about:blank",
    meta: { "company-id": String(companyId), "csrf-token": csrfToken },
    responses,
    requests: [],
    resourceTimingClears: 0,
  };
}

function appState(appStateCompanyId: number): PageResponse {
  return { body: { company: { id: appStateCompanyId } } };
}

function metaElement(page: FreeePage, selector: string) {
  const names = [...selector.matchAll(/meta\[name="([^"]+)"\]/g)].map((match) => match[1]);
  if (names.length === 0) throw new Error(`unsupported selector: ${selector}`);
  const name = names.find((candidate) => candidate !== undefined && candidate in page.meta);
  if (name === undefined) return null;
  return {
    getAttribute: (attribute: string) => (attribute === "content" ? page.meta[name] : null),
  };
}

async function evaluateInPage(page: FreeePage, script: string): Promise<string> {
  const context = createContext({
    Headers,
    location: {
      get origin() {
        return page.origin;
      },
    },
    document: { querySelector: (selector: string) => metaElement(page, selector) },
    performance: {
      clearResourceTimings() {
        page.resourceTimingClears += 1;
      },
    },
    async fetch(path: string, init: RequestInit = {}) {
      page.requests.push({
        method: init.method ?? "GET",
        path,
        headers: Object.fromEntries(new Headers(init.headers)),
        body: typeof init.body === "string" ? JSON.parse(init.body) : init.body,
      });
      const next = page.responses.shift();
      if (!next) throw new Error(`unexpected fetch: ${path}`);
      const { status = 200, body } = typeof next === "function" ? next() : next;
      const text = typeof body === "string" ? body : JSON.stringify(body);
      return new Response(text || null, { status });
    },
  });
  return String(await runInContext(script, context));
}

function mockAgentBrowser(
  page: FreeePage,
  commandResult: (command: string[]) => unknown = () => null,
) {
  const commands: string[][] = [];
  const respond = async (command: string[], stdin: string): Promise<unknown> => {
    if (command.includes("state") && command.includes("list")) return { files: [] };
    if (command.includes("eval")) return { result: await evaluateInPage(page, stdin) };
    if (command.at(-2) === "open") page.origin = new URL(command.at(-1) ?? "").origin;
    return commandResult(command);
  };
  const spawn = spyOn(Bun, "spawn").mockImplementation(((command: string[]) => {
    commands.push([...command]);
    let stdin = "";
    const stdout = Promise.withResolvers<string>();
    return {
      exited: stdout.promise.then(() => 0),
      killed: false,
      stdin: {
        write(value: string | Uint8Array) {
          stdin += typeof value === "string" ? value : new TextDecoder().decode(value);
        },
        end() {
          stdout.resolve(
            respond(command, stdin).then(
              (data) => JSON.stringify({ success: true, data, error: null }),
              (error: { message?: unknown }) =>
                JSON.stringify({ success: false, error: String(error.message) }),
            ),
          );
        },
      },
      stdout: new ReadableStream<Uint8Array>({
        async start(controller) {
          controller.enqueue(new TextEncoder().encode(await stdout.promise));
          controller.close();
        },
      }),
      stderr: new Response("").body,
      kill() {},
    };
  }) as typeof Bun.spawn);
  return { commands, spawn };
}

function invoiceSaveRequest(invoiceId: number, status: number) {
  return {
    requests: [
      {
        method: "POST",
        status,
        url: `${invoiceOrigin}/api/p/reports/invoices/${invoiceId}/accounting/deals`,
      },
    ],
  };
}

function observedInvoiceSave(status: number) {
  return (command: string[]) =>
    command.includes("--filter") ? invoiceSaveRequest(77, status) : null;
}

function previewResponse() {
  return {
    models: [
      {
        txn_date: "2026-08-24",
        rows: 1,
        debits: [{ account_item_name: "消耗品費", tax_name: "課対仕入10%", amount: 1_000 }],
        credits: [{ account_item_name: "銀行", tax_name: null, amount: 1_000 }],
      },
    ],
  };
}

function requestMatching(requests: PageRequest[], method: string, path: string, occurrence = 0) {
  const matches = requests.filter((request) => request.method === method && request.path === path);
  const request = matches[occurrence];
  if (!request) throw new Error(`request not found: ${method} ${path}`);
  return request;
}

const walletTransaction: FreeeWebWalletTransaction = {
  id: 42,
  companyId,
  date: "2026-08-24",
  description: "secret description",
  entrySide: "expense",
  receivedAmount: 0,
  spentAmount: 1_000,
  status: 1,
  statusName: "未処理",
  recoveryLocked: false,
  updatedAt: "2026-08-24T00:00:00+09:00",
  walletableId: 7,
  walletableName: "銀行",
  dealIds: [],
  transferIds: [],
  suggestionContext: {
    suggestion: { source: "rule" },
    suggestEvent: "matched",
    suggestLogV3: { id: 9 },
  },
};

const registration: FreeeWebRegistration = {
  walletTransaction,
  lines: [
    {
      accountItemName: "消耗品費",
      taxName: "課対仕入10%",
      amount: 1_000,
      description: "secret description",
    },
  ],
};

describe("Agent Browserのfreeeセッション", () => {
  test("暗号鍵がなければweb stateを復元しない", async () => {
    delete Bun.env.AGENT_BROWSER_ENCRYPTION_KEY;
    delete Bun.env.HOME;
    delete Bun.env.USERPROFILE;
    await expect(withFreeeWeb(webScope, async () => undefined)).rejects.toThrow(
      "AGENT_BROWSER_ENCRYPTION_KEY",
    );
  });

  test("Auth Profileをsession IDへ含め、事業所不一致時は同じsessionの復旧手順を示す", async () => {
    Bun.env.AGENT_BROWSER_ENCRYPTION_KEY = encryptionKey;
    const page = freeePage();
    page.meta["company-id"] = "999";
    const { commands, spawn } = mockAgentBrowser(page);
    try {
      const result = expect(withFreeeWeb(webScope, async () => undefined)).rejects;
      await result.toThrow(
        `agent-browser --namespace freee-web --session ${expectedSessionId("fb", companyId, webScope.authProfile)} --restore --headed open "https://secure.freee.co.jp/"`,
      );
      await result.toThrow("別名のAuth Profile");
      await result.toThrow(`現在のAuth Profileは${webScope.authProfile}`);
    } finally {
      spawn.mockRestore();
    }
    expect(commands.flat()).toContain(expectedSessionId("fb", companyId, webScope.authProfile));
  });

  test("Web内部APIのmethod、path、header、payloadをページのfetch境界で固定する", async () => {
    Bun.env.AGENT_BROWSER_ENCRYPTION_KEY = encryptionKey;
    const registrationResult = { wallet_txn: { id: 42, status: 2 } };
    const page = freeePage([
      {
        body: {
          id: 42,
          company_id: companyId,
          description: walletTransaction.description,
          entry_side_str: "expense",
          get_received_amount: 0,
          get_spent_amount: 1_000,
          status: 1,
          status_str: "未処理",
          txn_date: "2026-08-24",
          updated_at: "2026-08-24T00:00:00+09:00",
          walletable_id: 7,
          walletable_name: "銀行",
        },
      },
      { body: previewResponse() },
      { body: registrationResult },
      { body: previewResponse() },
      { body: registrationResult },
      { body: previewResponse() },
      { body: registrationResult },
      { status: 204, body: "" },
      { status: 204, body: "" },
      { body: { info: { matchCount: 2, tooManyUnreconciledWalletTxns: false } } },
      { body: { wallet_txn_ids: [42, 43] } },
      {
        body: {
          walletables: [
            {
              walletable_id: 7,
              name: "銀行",
              walletable_type: "bank_account",
              walletable_status: "synced",
              last_synced_at: "2026-08-24T01:00:00.000Z",
              connected_service_id: 70,
              is_sync_frequency_limited: false,
              sync_failed_reason: null,
            },
          ],
          summary: { has_syncing: false, available_sync_all: true, ready_to_sync_all: true },
        },
      },
      { body: {} },
      {
        body: {
          walletable_status: "synced",
          last_synced_at: "2026-08-24T01:10:00.000Z",
          sync_failed_reason: null,
        },
      },
      { body: {} },
    ]);
    const { commands, spawn } = mockAgentBrowser(page);

    try {
      await withFreeeWeb(webScope, async (web) => {
        await web.walletTransaction(42);
        await web.previewWalletTransactionRegistration(registration);
        await web.registerWalletTransaction(registration);
        await web.previewWalletTransactionSettlement({
          walletTransaction,
          dealId: 91,
          amount: 1_000,
        });
        await web.settleWalletTransaction({ walletTransaction, dealId: 91, amount: 1_000 });
        await web.previewWalletTransactionTransfer({
          walletTransaction,
          counterpartyWalletableName: "事業主借",
          description: "資金移動",
        });
        await web.registerWalletTransactionTransfer({
          walletTransaction,
          counterpartyWalletableName: "事業主借",
          description: "資金移動",
        });
        await web.ignoreWalletTransaction(walletTransaction);
        await web.restoreIgnoredWalletTransaction(walletTransaction);
        await web.autoRegistrationRuleMatchCount();
        await web.applyAutoRegistrationRules();
        await expect(web.walletableSummary()).resolves.toEqual({
          walletables: [
            {
              id: 7,
              name: "銀行",
              type: "bank_account",
              status: "synced",
              lastSyncedAt: "2026-08-24T01:00:00.000Z",
              connectedServiceId: 70,
              isSyncFrequencyLimited: false,
              syncFailedReason: null,
            },
          ],
          hasSyncing: false,
          canSyncAll: true,
          readyToSyncAll: true,
        });
        await web.startWalletableSync("bank_account", 7);
        await expect(web.walletableSyncState("bank_account", 7)).resolves.toEqual({
          status: "synced",
          lastSyncedAt: "2026-08-24T01:10:00.000Z",
          syncFailedReason: null,
        });
        await web.startBulkWalletableSync();
      });
    } finally {
      spawn.mockRestore();
    }

    const requests = page.requests;
    expect(requests.map(({ method, path }) => ({ method, path }))).toEqual([
      { method: "GET", path: "/api/p/wallet_txns/42" },
      { method: "POST", path: "/api/p/wallet_txns/42/previews/standard" },
      { method: "PUT", path: "/api/p/wallet_txns/42/reconcile" },
      { method: "POST", path: "/api/p/wallet_txns/42/previews/scrub" },
      { method: "PUT", path: "/api/p/wallet_txns/42/reconcile" },
      { method: "POST", path: "/api/p/wallet_txns/42/previews/transfer" },
      { method: "PUT", path: "/api/p/wallet_txns/42/reconcile" },
      { method: "PUT", path: "/api/p/wallet_txns/42/ignore" },
      { method: "PUT", path: "/api/p/wallet_txns/42/recover" },
      { method: "GET", path: "/wallet_txns/match_count" },
      { method: "POST", path: "/wallet_txns/bulk_match" },
      { method: "GET", path: "/api/p/v2/walletables/summary" },
      { method: "PUT", path: "/api/p/v2/walletables/bank_account/7/sync" },
      { method: "GET", path: "/api/p/v2/walletables/bank_account/7/sync_status" },
      { method: "PUT", path: "/api/p/v2/walletables/sync_all" },
    ]);
    const registrationReconcile = {
      wallet_txn_id: 42,
      new_deal: {
        payment_walletable: "銀行",
        deal: {
          issue_date: "2026-08-24",
          partner_name: "",
          line_items: [
            {
              account_item_name: "消耗品費",
              tax_name: "課対仕入10%",
              item_name: null,
              section_name: null,
              default_tags: [],
              tax_entry_method: 1,
              unit_price: 1_000,
              description: "secret description",
              division_tag_1_id: null,
              division_tag_2_id: null,
              division_tag_3_id: null,
            },
          ],
        },
      },
      existing_deals: [],
    };
    expect(
      requestMatching(requests, "POST", "/api/p/wallet_txns/42/previews/standard").body,
    ).toEqual({
      from: "new_version",
      reconcile: registrationReconcile,
    });
    expect(requestMatching(requests, "PUT", "/api/p/wallet_txns/42/reconcile", 0).body).toEqual({
      reconciled_from: "stream_detail",
      reconciled_time: 0,
      reconcile: registrationReconcile,
      skip_saving_matcher: true,
      suggestion: { source: "rule" },
      suggest_event: "matched",
      suggest_log_v3: { id: 9 },
      from: "new_version",
    });
    expect(requestMatching(requests, "POST", "/api/p/wallet_txns/42/previews/scrub").body).toEqual({
      from: "new_version",
      reconcile: { wallet_txn_id: 42, existing_deals: [{ deal_id: 91, amount: 1_000 }] },
    });
    expect(requestMatching(requests, "PUT", "/api/p/wallet_txns/42/reconcile", 1).body).toEqual({
      reconcile: { wallet_txn_id: 42, existing_deals: [{ deal_id: 91, amount: 1_000 }] },
      suggestion: { source: "rule" },
      suggest_event: "matched",
      suggest_log_v3: { id: 9 },
      skip_saving_matcher: true,
      reconciled_time: 0,
      reconciled_from: "stream_detail",
      from: "new_version",
    });
    const transfer = {
      date: "2026-08-24",
      transfer_lines: [
        {
          amount: 1_000,
          walletable_from: "銀行",
          walletable_to: "事業主借",
          description: "資金移動",
        },
      ],
    };
    expect(
      requestMatching(requests, "POST", "/api/p/wallet_txns/42/previews/transfer").body,
    ).toEqual({ ...transfer, from: "new_version" });
    expect(requestMatching(requests, "PUT", "/api/p/wallet_txns/42/reconcile", 2).body).toEqual({
      ...transfer,
      suggestion: { source: "rule" },
      suggest_event: "matched",
      suggest_log_v3: { id: 9 },
      skip_saving_matcher: true,
      reconciled_time: 0,
      reconciled_from: "stream_detail",
      from: "new_version",
    });
    expect(requestMatching(requests, "PUT", "/api/p/wallet_txns/42/ignore").body).toEqual({
      reconciled_time: 0,
      reconciled_from: "wallet_txns_index",
      suggest_log_v3: { id: 9 },
    });
    expect(requestMatching(requests, "PUT", "/api/p/wallet_txns/42/recover").body).toBeUndefined();
    expect(requestMatching(requests, "POST", "/wallet_txns/bulk_match").body).toBeUndefined();
    for (const request of requests) {
      if (request.method === "GET") {
        expect(request.headers).toEqual({ accept: "application/json" });
      } else {
        expect(request.headers).toEqual({
          accept: "application/json",
          "x-csrf-token": csrfToken,
          "content-type":
            request.body === undefined
              ? "application/x-www-form-urlencoded; charset=UTF-8"
              : "application/json",
        });
      }
    }
    expect(commands.at(-1)?.at(-1)).toBe("close");
    expect(commands.flat().join(" ")).not.toContain("secret description");
  });

  test.each([
    [
      "ログイン画面へ遷移していたら",
      (page: FreeePage) => {
        page.origin = loginOrigin;
      },
      "Unexpected freee origin",
    ],
    [
      "別の事業所へ切り替わっていたら",
      (page: FreeePage) => {
        page.meta["company-id"] = "999";
      },
      "FREEE_COMPANY_MISMATCH",
    ],
    [
      "CSRF tokenがなければ",
      (page: FreeePage) => {
        page.meta = { "company-id": String(companyId) };
      },
      "freee CSRF token is unavailable",
    ],
  ])("会計画面が%s書き込みを送信せず確定失敗とする", async (_condition, change, message) => {
    Bun.env.AGENT_BROWSER_ENCRYPTION_KEY = encryptionKey;
    const page = freeePage();
    const { spawn } = mockAgentBrowser(page);
    try {
      const error = await withFreeeWeb(webScope, (web) => {
        change(page);
        return web.ignoreWalletTransaction(walletTransaction);
      }).catch((cause: unknown) => cause);
      expect(error).toBeInstanceOf(Error);
      expect(error).not.toBeInstanceOf(OutcomeUnknownError);
      expect((error as Error).message).toContain(message);
    } finally {
      spawn.mockRestore();
    }
    expect(page.requests).toEqual([]);
  });

  test("仕訳preview末尾の空modelを除外する", async () => {
    Bun.env.AGENT_BROWSER_ENCRYPTION_KEY = encryptionKey;
    const validModel = previewResponse().models[0];
    const { spawn } = mockAgentBrowser(
      freeePage([
        {
          body: {
            models: [
              validModel,
              {
                txn_date: null,
                rows: 0,
                debits: [],
                credits: [],
              },
            ],
          },
        },
      ]),
    );

    try {
      await expect(
        withFreeeWeb(webScope, (web) =>
          web.previewWalletTransactionSettlement({
            walletTransaction,
            dealId: 91,
            amount: 1_000,
          }),
        ),
      ).resolves.toEqual([
        {
          date: "2026-08-24",
          rows: 1,
          debits: [{ accountItemName: "消耗品費", taxName: "課対仕入10%", amount: 1_000 }],
          credits: [{ accountItemName: "銀行", taxName: null, amount: 1_000 }],
        },
      ]);
    } finally {
      spawn.mockRestore();
    }
  });

  test("walletable summaryの観測schemaが崩れたら失敗する", async () => {
    Bun.env.AGENT_BROWSER_ENCRYPTION_KEY = encryptionKey;
    const { spawn } = mockAgentBrowser(
      freeePage([{ body: { walletables: [{ walletable_id: 7, name: "銀行" }], summary: {} } }]),
    );
    try {
      await expect(withFreeeWeb(webScope, (web) => web.walletableSummary())).rejects.toThrow();
    } finally {
      spawn.mockRestore();
    }
  });

  test("呼び出し側から渡された取引の事業所がscopeと異なる場合は送信しない", async () => {
    Bun.env.AGENT_BROWSER_ENCRYPTION_KEY = encryptionKey;
    const otherCompanyTransaction = { ...walletTransaction, companyId: companyId + 1 };
    const otherCompanyRegistration = {
      ...registration,
      walletTransaction: otherCompanyTransaction,
    };
    const page = freeePage();
    const { spawn } = mockAgentBrowser(page);
    try {
      await withFreeeWeb(webScope, async (web) => {
        const operations = [
          () => web.previewWalletTransactionRegistration(otherCompanyRegistration),
          () => web.registerWalletTransaction(otherCompanyRegistration),
          () =>
            web.previewWalletTransactionSettlement({
              walletTransaction: otherCompanyTransaction,
              dealId: 91,
              amount: 1_000,
            }),
          () =>
            web.settleWalletTransaction({
              walletTransaction: otherCompanyTransaction,
              dealId: 91,
              amount: 1_000,
            }),
          () =>
            web.previewWalletTransactionTransfer({
              walletTransaction: otherCompanyTransaction,
              counterpartyWalletableName: "事業主借",
              description: "資金移動",
            }),
          () =>
            web.registerWalletTransactionTransfer({
              walletTransaction: otherCompanyTransaction,
              counterpartyWalletableName: "事業主借",
              description: "資金移動",
            }),
          () => web.ignoreWalletTransaction(otherCompanyTransaction),
          () => web.restoreIgnoredWalletTransaction(otherCompanyTransaction),
        ];
        for (const operation of operations) {
          await expect(operation()).rejects.toThrow(`事業所${companyId}`);
        }
      });
    } finally {
      spawn.mockRestore();
    }

    expect(page.requests).toEqual([]);
  });

  test("請求書の送付ステータスを専用Web endpointで送付済みにする", async () => {
    Bun.env.AGENT_BROWSER_ENCRYPTION_KEY = encryptionKey;
    const page = freeePage([appState(companyId), appState(companyId), { body: {} }]);
    const { spawn } = mockAgentBrowser(page);
    try {
      await expect(
        withFreeeWeb(webScope, (web) => web.setInvoiceSendingStatus(77, "sent")),
      ).resolves.toBeUndefined();
    } finally {
      spawn.mockRestore();
    }

    expect(page.origin).toBe(invoiceOrigin);
    expect(page.requests.at(-1)).toEqual({
      method: "PUT",
      path: "/api/p/reports/invoices/77/deliver_status",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        "x-csrf-token": csrfToken,
        "x-company-id": "1234567",
        "x-freee-client-name": "invoice",
      },
      body: { deliver_status: "delivered" },
    });
  });

  test("請求書の送付ステータスを専用Web endpointで送付待ちに戻す", async () => {
    Bun.env.AGENT_BROWSER_ENCRYPTION_KEY = encryptionKey;
    const page = freeePage([appState(companyId), appState(companyId), { body: {} }]);
    const { spawn } = mockAgentBrowser(page);
    try {
      await expect(
        withFreeeWeb(webScope, (web) => web.setInvoiceSendingStatus(77, "unsent")),
      ).resolves.toBeUndefined();
    } finally {
      spawn.mockRestore();
    }

    expect(page.requests.at(-1)?.body).toEqual({ deliver_status: "undelivered" });
  });

  test("請求書の送付ステータス変更が5xxなら結果不明とする", async () => {
    Bun.env.AGENT_BROWSER_ENCRYPTION_KEY = encryptionKey;
    const { spawn } = mockAgentBrowser(
      freeePage([appState(companyId), appState(companyId), { status: 500, body: {} }]),
    );
    try {
      await expect(
        withFreeeWeb(webScope, (web) => web.setInvoiceSendingStatus(77, "sent")),
      ).rejects.toBeInstanceOf(OutcomeUnknownError);
    } finally {
      spawn.mockRestore();
    }
  });

  test.each([
    [
      "ログイン画面へ遷移していたら",
      (page: FreeePage) => {
        page.responses = [
          () => {
            page.origin = loginOrigin;
            return appState(companyId);
          },
        ];
      },
      "Unexpected freee origin",
    ],
    [
      "別の事業所へ切り替わっていたら",
      (page: FreeePage) => {
        page.responses = [appState(companyId), appState(999)];
      },
      "FREEE_COMPANY_MISMATCH",
    ],
    [
      "CSRF tokenがなければ",
      (page: FreeePage) => {
        page.responses = [appState(companyId), appState(companyId)];
        page.meta = { "company-id": String(companyId) };
      },
      "freee CSRF token is unavailable",
    ],
  ])(
    "請求書画面が%s送付ステータスを送信せず確定失敗とする",
    async (_condition, arrange, message) => {
      Bun.env.AGENT_BROWSER_ENCRYPTION_KEY = encryptionKey;
      const page = freeePage();
      arrange(page);
      const { spawn } = mockAgentBrowser(page);
      try {
        const error = await withFreeeWeb(webScope, (web) =>
          web.setInvoiceSendingStatus(77, "sent"),
        ).catch((cause: unknown) => cause);
        expect(error).toBeInstanceOf(Error);
        expect(error).not.toBeInstanceOf(OutcomeUnknownError);
        expect((error as Error).message).toContain(message);
      } finally {
        spawn.mockRestore();
      }
      expect(page.requests.filter(({ path }) => path !== "/api/p/app_state")).toEqual([]);
    },
  );

  test("請求書はexactな取引登録ボタンを押して保存完了を待つ", async () => {
    Bun.env.AGENT_BROWSER_ENCRYPTION_KEY = encryptionKey;
    const page = freeePage([appState(companyId)]);
    const { commands, spawn } = mockAgentBrowser(page, observedInvoiceSave(200));
    try {
      await withFreeeWeb(webScope, (web) => web.registerInvoiceDeal(77));
    } finally {
      spawn.mockRestore();
    }

    expect(commands).toContainEqual(
      expect.arrayContaining(["find", "role", "button", "click", "--name", "取引登録", "--exact"]),
    );
    expect(
      commands.some(
        (command) =>
          command.includes("wait") &&
          command.includes("--fn") &&
          command.join(" ").includes("accounting/deals"),
      ),
    ).toBe(true);
    expect(page.resourceTimingClears).toBe(1);
    expect(commands).toContainEqual(expect.arrayContaining(["network", "requests", "--clear"]));
    expect(commands).toContainEqual(
      expect.arrayContaining([
        "network",
        "requests",
        "--filter",
        `${invoiceOrigin}/api/p/reports/invoices/77/accounting/deals`,
        "--method",
        "POST",
      ]),
    );
    expect(commands.at(-1)?.at(-1)).toBe("close");
  });

  test("請求書の保存通信が5xxなら結果不明とする", async () => {
    Bun.env.AGENT_BROWSER_ENCRYPTION_KEY = encryptionKey;
    const { commands, spawn } = mockAgentBrowser(
      freeePage([appState(companyId)]),
      observedInvoiceSave(500),
    );
    try {
      await expect(
        withFreeeWeb(webScope, (web) => web.registerInvoiceDeal(77)),
      ).rejects.toBeInstanceOf(OutcomeUnknownError);
    } finally {
      spawn.mockRestore();
    }
    expect(commands.at(-1)?.at(-1)).toBe("close");
  });

  test("請求書の保存待機が失敗しても2xx通信を確認できれば成功とする", async () => {
    Bun.env.AGENT_BROWSER_ENCRYPTION_KEY = encryptionKey;
    const { spawn } = mockAgentBrowser(freeePage([appState(companyId)]), (command) => {
      if (command.includes("wait")) throw new Error("wait timed out");
      return observedInvoiceSave(200)(command);
    });
    try {
      await expect(
        withFreeeWeb(webScope, (web) => web.registerInvoiceDeal(77)),
      ).resolves.toBeUndefined();
    } finally {
      spawn.mockRestore();
    }
  });

  test("請求書の保存操作後に通信結果を確認できなければ結果不明とする", async () => {
    Bun.env.AGENT_BROWSER_ENCRYPTION_KEY = encryptionKey;
    const { spawn } = mockAgentBrowser(freeePage([appState(companyId)]), (command) => {
      if (command.includes("wait")) throw new Error("wait timed out");
      return command.includes("--filter") ? { requests: [] } : null;
    });
    try {
      const result = withFreeeWeb(webScope, (web) => web.registerInvoiceDeal(77));
      await expect(result).rejects.toBeInstanceOf(OutcomeUnknownError);
      await expect(result).rejects.toMatchObject({ code: "OUTCOME_UNKNOWN" });
    } finally {
      spawn.mockRestore();
    }
  });

  test("請求書登録後の会計操作では会計画面と事業所を再確認する", async () => {
    Bun.env.AGENT_BROWSER_ENCRYPTION_KEY = encryptionKey;
    const page = freeePage([
      appState(companyId),
      {
        body: {
          id: 42,
          company_id: companyId,
          description: walletTransaction.description,
          entry_side_str: "expense",
          get_received_amount: 0,
          get_spent_amount: 1_000,
          status: 1,
          status_str: "未処理",
          txn_date: "2026-08-24",
          updated_at: "2026-08-24T00:00:00+09:00",
          walletable_id: 7,
          walletable_name: "銀行",
        },
      },
    ]);
    const { commands, spawn } = mockAgentBrowser(page, observedInvoiceSave(200));
    try {
      await expect(
        withFreeeWeb(webScope, async (web) => {
          await web.registerInvoiceDeal(77);
          return web.walletTransaction(42);
        }),
      ).resolves.toMatchObject({ id: 42, companyId });
    } finally {
      spawn.mockRestore();
    }
    expect(
      commands.filter(
        (command) => command.includes("open") && command.includes("https://secure.freee.co.jp/"),
      ),
    ).toHaveLength(2);
    expect(commands.at(-1)?.at(-1)).toBe("close");
  });

  test("書き込み応答schemaが崩れたら結果不明とする", async () => {
    Bun.env.AGENT_BROWSER_ENCRYPTION_KEY = encryptionKey;
    const { commands, spawn } = mockAgentBrowser(
      freeePage([{ body: { wallet_txn: { id: 42, status: 1 } } }]),
    );
    try {
      const result = withFreeeWeb(webScope, (web) => web.registerWalletTransaction(registration));
      await expect(result).rejects.toBeInstanceOf(OutcomeUnknownError);
      await expect(result).rejects.toMatchObject({ code: "OUTCOME_UNKNOWN" });
    } finally {
      spawn.mockRestore();
    }
    expect(commands.at(-1)?.at(-1)).toBe("close");
  });

  test("書き込みの5xxは結果不明、4xxは確定失敗とする", async () => {
    Bun.env.AGENT_BROWSER_ENCRYPTION_KEY = encryptionKey;
    const { spawn } = mockAgentBrowser(
      freeePage([
        { status: 500, body: { error: "failed" } },
        { status: 400, body: { error: "invalid" } },
      ]),
    );
    try {
      await withFreeeWeb(webScope, async (web) => {
        await expect(web.ignoreWalletTransaction(walletTransaction)).rejects.toBeInstanceOf(
          OutcomeUnknownError,
        );
        await expect(web.ignoreWalletTransaction(walletTransaction)).rejects.toThrow("HTTP 400");
      });
    } finally {
      spawn.mockRestore();
    }
  });

  test("書き込み通信の確認を失ったら結果不明とする", async () => {
    Bun.env.AGENT_BROWSER_ENCRYPTION_KEY = encryptionKey;
    const page = freeePage([
      () => {
        throw new TypeError("Failed to fetch");
      },
    ]);
    const { spawn } = mockAgentBrowser(page);
    try {
      const result = withFreeeWeb(webScope, (web) =>
        web.ignoreWalletTransaction(walletTransaction),
      );
      await expect(result).rejects.toBeInstanceOf(OutcomeUnknownError);
      await expect(result).rejects.toMatchObject({ code: "OUTCOME_UNKNOWN" });
    } finally {
      spawn.mockRestore();
    }
    expect(page.requests.map(({ method, path }) => ({ method, path }))).toEqual([
      { method: "PUT", path: "/api/p/wallet_txns/42/ignore" },
    ]);
  });

  test("書き込み成功後のsession cleanup失敗で成功を上書きしない", async () => {
    Bun.env.AGENT_BROWSER_ENCRYPTION_KEY = encryptionKey;
    const { spawn } = mockAgentBrowser(
      freeePage([{ body: { wallet_txn: { id: 42, status: 2 } } }]),
      (command) => {
        if (command.at(-1) === "close") throw new Error("close failed");
        return null;
      },
    );
    try {
      await expect(
        withFreeeWeb(webScope, (web) => web.registerWalletTransaction(registration)),
      ).resolves.toEqual({ walletTransactionId: 42 });
    } finally {
      spawn.mockRestore();
    }
  });

  test("session cleanup失敗後も同じscopeを再取得できる", async () => {
    Bun.env.AGENT_BROWSER_ENCRYPTION_KEY = encryptionKey;
    let closeAttempts = 0;
    const { spawn } = mockAgentBrowser(freeePage(), (command) => {
      if (command.at(-1) !== "close") return null;
      closeAttempts += 1;
      if (closeAttempts === 1) throw new Error("close failed");
      return null;
    });
    try {
      await expect(withFreeeWeb(webScope, async () => "first")).resolves.toBe("first");
      await expect(withFreeeWeb(webScope, async () => "second")).resolves.toBe("second");
    } finally {
      spawn.mockRestore();
    }
    expect(closeAttempts).toBe(2);
  });
});
