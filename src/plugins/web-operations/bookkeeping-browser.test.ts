import { afterEach, describe, expect, spyOn, test } from "bun:test";
import { createHash } from "node:crypto";

import { OutcomeUnknownError } from "../../errors.ts";
import {
  type FreeeWebRegistration,
  type FreeeWebWalletTransaction,
  withFreeeBrowser,
} from "./bookkeeping-browser.ts";

const companyId = 2_021_254;
const browserScope = { companyId, authProfile: "test-freee" } as const;
const origin = "https://secure.freee.co.jp";
const invoiceOrigin = "https://invoice.secure.freee.co.jp";
const encryptionKey = "a".repeat(64);
const previousEncryptionKey = Bun.env.AGENT_BROWSER_ENCRYPTION_KEY;
const previousHome = Bun.env.HOME;
const previousUserProfile = Bun.env.USERPROFILE;

function expectedSessionId(prefix: string, scopedCompanyId: number, authProfile: string): string {
  const profileKey = createHash("sha256").update(authProfile).digest("hex").slice(0, 16);
  return `${prefix}-${scopedCompanyId}-${profileKey}`;
}

afterEach(() => {
  if (previousEncryptionKey === undefined) delete Bun.env.AGENT_BROWSER_ENCRYPTION_KEY;
  else Bun.env.AGENT_BROWSER_ENCRYPTION_KEY = previousEncryptionKey;
  if (previousHome === undefined) delete Bun.env.HOME;
  else Bun.env.HOME = previousHome;
  if (previousUserProfile === undefined) delete Bun.env.USERPROFILE;
  else Bun.env.USERPROFILE = previousUserProfile;
});

function agentBrowserSuccess(data: unknown): string {
  return JSON.stringify({ success: true, data, error: null });
}

function webResponse(body: unknown, status = 200) {
  return {
    result: JSON.stringify({
      origin,
      status,
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  };
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

function mockAgentBrowser(responses: unknown[]) {
  const commands: string[][] = [];
  const standardInputs: string[] = [];
  const spawn = spyOn(Bun, "spawn").mockImplementation(((command: string[]) => {
    const inputIndex = commands.length;
    commands.push([...command]);
    let stdout: string;
    if (command.includes("state") && command.includes("list")) {
      stdout = agentBrowserSuccess({ files: [] });
    } else {
      if (responses.length === 0) throw new Error(`unexpected command: ${command.join(" ")}`);
      const response = responses.shift();
      stdout =
        response instanceof Error
          ? JSON.stringify({ success: false, error: response.message })
          : agentBrowserSuccess(response);
    }
    return {
      exited: Promise.resolve(0),
      killed: false,
      stdin: {
        write(value: string | Uint8Array) {
          standardInputs[inputIndex] =
            typeof value === "string" ? value : new TextDecoder().decode(value);
        },
        end() {},
      },
      stdout: new Response(stdout).body,
      stderr: new Response("").body,
      kill() {},
    };
  }) as typeof Bun.spawn);
  return { commands, standardInputs, spawn };
}

function requestFromScript(script: string) {
  const path = script.match(/const response = await fetch\(("[^"]+"),/);
  const method = script.match(/method: ("(?:GET|POST|PUT)"),/);
  const body = script.match(/body: JSON\.stringify\((.+)\)\n/);
  if (!path || !method) throw new Error("request script is malformed");
  return {
    method: JSON.parse(method[1] as string),
    path: JSON.parse(path[1] as string),
    body: body ? JSON.parse(body[1] as string) : undefined,
    script,
  };
}

function requestMatching(
  requests: ReturnType<typeof requestFromScript>[],
  method: string,
  path: string,
  occurrence = 0,
) {
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
      accountItem: "消耗品費",
      taxCode: "課対仕入10%",
      amount: 1_000,
      description: "secret description",
    },
  ],
};

describe("Agent Browserのfreeeセッション", () => {
  test("暗号鍵がなければbrowser stateを復元しない", async () => {
    delete Bun.env.AGENT_BROWSER_ENCRYPTION_KEY;
    delete Bun.env.HOME;
    delete Bun.env.USERPROFILE;
    await expect(withFreeeBrowser(browserScope, async () => undefined)).rejects.toThrow(
      "AGENT_BROWSER_ENCRYPTION_KEY",
    );
  });

  test("Auth Profileをsession IDへ含め、事業所不一致時は同じsessionの復旧手順を示す", async () => {
    Bun.env.AGENT_BROWSER_ENCRYPTION_KEY = encryptionKey;
    const { commands, spawn } = mockAgentBrowser([
      null,
      { result: JSON.stringify({ origin, companyId: 999 }) },
      null,
    ]);
    try {
      const result = expect(
        withFreeeBrowser({ companyId, authProfile: "business-freee" }, async () => undefined),
      ).rejects;
      await result.toThrow(
        `agent-browser --namespace freee-web --session ${expectedSessionId("fb", companyId, "business-freee")} --restore --headed open "https://secure.freee.co.jp/"`,
      );
      await result.toThrow("別名のAuth Profile");
      await result.toThrow("現在のAuth Profileはbusiness-freee");
    } finally {
      spawn.mockRestore();
    }
    expect(commands.flat()).toContain(expectedSessionId("fb", companyId, "business-freee"));
  });

  test("Web内部APIのmethod、path、payloadをAdapter境界で固定する", async () => {
    Bun.env.AGENT_BROWSER_ENCRYPTION_KEY = encryptionKey;
    const registrationResult = { wallet_txn: { id: 42, status: 2 } };
    const { commands, standardInputs, spawn } = mockAgentBrowser([
      null,
      { result: JSON.stringify({ origin, companyId }) },
      webResponse({
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
      }),
      webResponse(previewResponse()),
      webResponse(registrationResult),
      webResponse(previewResponse()),
      webResponse(registrationResult),
      webResponse(previewResponse()),
      webResponse(registrationResult),
      webResponse("", 204),
      webResponse({ wallet_txn_ids: [42, 43] }),
      null,
    ]);

    try {
      await withFreeeBrowser(browserScope, async (browser) => {
        await browser.walletTransaction(42);
        await browser.previewWalletTxnRegistration(registration);
        await browser.registerWalletTransaction(registration);
        await browser.previewWalletTxnSettlement({ walletTransaction, dealId: 91, amount: 1_000 });
        await browser.settleWalletTransaction({ walletTransaction, dealId: 91, amount: 1_000 });
        await browser.previewWalletTxnTransfer({
          walletTransaction,
          counterpartyWalletableName: "事業主借",
          description: "資金移動",
        });
        await browser.registerWalletTxnTransfer({
          walletTransaction,
          counterpartyWalletableName: "事業主借",
          description: "資金移動",
        });
        await browser.ignoreWalletTransaction(walletTransaction);
        await browser.applyAutoRegistrationRules();
      });
    } finally {
      spawn.mockRestore();
    }

    const requestScripts = standardInputs.filter((script) =>
      script.includes("const response = await fetch"),
    );
    const requests = requestScripts.map(requestFromScript);
    expect(requests.map(({ method, path }) => ({ method, path }))).toEqual([
      { method: "GET", path: "/api/p/wallet_txns/42" },
      { method: "POST", path: "/api/p/wallet_txns/42/previews/standard" },
      { method: "PUT", path: "/api/p/wallet_txns/42/reconcile" },
      { method: "POST", path: "/api/p/wallet_txns/42/previews/scrub" },
      { method: "PUT", path: "/api/p/wallet_txns/42/reconcile" },
      { method: "POST", path: "/api/p/wallet_txns/42/previews/transfer" },
      { method: "PUT", path: "/api/p/wallet_txns/42/reconcile" },
      { method: "PUT", path: "/api/p/wallet_txns/42/ignore" },
      { method: "POST", path: "/wallet_txns/bulk_match" },
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
    expect(requestMatching(requests, "POST", "/wallet_txns/bulk_match").body).toBeUndefined();
    for (const request of requests) {
      if (request.method === "GET") {
        expect(request.script).not.toContain("X-CSRF-Token");
      } else {
        expect(request.script).toContain("X-CSRF-Token");
        expect(request.script).toContain(
          request.body === undefined ? "application/x-www-form-urlencoded" : "application/json",
        );
      }
    }
    expect(commands.at(-1)?.at(-1)).toBe("close");
    expect(commands.flat().join(" ")).not.toContain("secret description");
    expect(standardInputs.join("\n")).not.toContain("XMLHttpRequest");
  });

  test("呼び出し側から渡された取引の事業所がscopeと異なる場合は送信しない", async () => {
    Bun.env.AGENT_BROWSER_ENCRYPTION_KEY = encryptionKey;
    const otherCompanyTransaction = { ...walletTransaction, companyId: companyId + 1 };
    const otherCompanyRegistration = {
      ...registration,
      walletTransaction: otherCompanyTransaction,
    };
    const { standardInputs, spawn } = mockAgentBrowser([
      null,
      { result: JSON.stringify({ origin, companyId }) },
      null,
    ]);
    try {
      await withFreeeBrowser(browserScope, async (browser) => {
        const operations = [
          () => browser.previewWalletTxnRegistration(otherCompanyRegistration),
          () => browser.registerWalletTransaction(otherCompanyRegistration),
          () =>
            browser.previewWalletTxnSettlement({
              walletTransaction: otherCompanyTransaction,
              dealId: 91,
              amount: 1_000,
            }),
          () =>
            browser.settleWalletTransaction({
              walletTransaction: otherCompanyTransaction,
              dealId: 91,
              amount: 1_000,
            }),
          () =>
            browser.previewWalletTxnTransfer({
              walletTransaction: otherCompanyTransaction,
              counterpartyWalletableName: "事業主借",
              description: "資金移動",
            }),
          () =>
            browser.registerWalletTxnTransfer({
              walletTransaction: otherCompanyTransaction,
              counterpartyWalletableName: "事業主借",
              description: "資金移動",
            }),
          () => browser.ignoreWalletTransaction(otherCompanyTransaction),
        ];
        for (const operation of operations) {
          await expect(operation()).rejects.toThrow(`事業所${companyId}`);
        }
      });
    } finally {
      spawn.mockRestore();
    }

    expect(
      standardInputs.filter((script) => script.includes("const response = await fetch")),
    ).toHaveLength(0);
  });

  test("請求書はexactな取引登録ボタンを押して保存完了を待つ", async () => {
    Bun.env.AGENT_BROWSER_ENCRYPTION_KEY = encryptionKey;
    const { commands, standardInputs, spawn } = mockAgentBrowser([
      null,
      { result: JSON.stringify({ origin, companyId }) },
      null,
      { result: JSON.stringify({ origin: invoiceOrigin }) },
      { result: JSON.stringify({ origin: invoiceOrigin, companyId }) },
      { result: "undefined" },
      null,
      null,
      null,
      invoiceSaveRequest(77, 200),
      null,
    ]);
    try {
      await withFreeeBrowser(browserScope, (browser) => browser.postInvoiceDeal(77));
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
    expect(standardInputs.join("\n")).toContain("performance.clearResourceTimings()");
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
    const { commands, spawn } = mockAgentBrowser([
      null,
      { result: JSON.stringify({ origin, companyId }) },
      null,
      { result: JSON.stringify({ origin: invoiceOrigin }) },
      { result: JSON.stringify({ origin: invoiceOrigin, companyId }) },
      { result: "undefined" },
      null,
      null,
      null,
      invoiceSaveRequest(77, 500),
      null,
    ]);
    try {
      await expect(
        withFreeeBrowser(browserScope, (browser) => browser.postInvoiceDeal(77)),
      ).rejects.toBeInstanceOf(OutcomeUnknownError);
    } finally {
      spawn.mockRestore();
    }
    expect(commands.at(-1)?.at(-1)).toBe("close");
  });

  test("請求書の保存待機が失敗しても2xx通信を確認できれば成功とする", async () => {
    Bun.env.AGENT_BROWSER_ENCRYPTION_KEY = encryptionKey;
    const { spawn } = mockAgentBrowser([
      null,
      { result: JSON.stringify({ origin, companyId }) },
      null,
      { result: JSON.stringify({ origin: invoiceOrigin }) },
      { result: JSON.stringify({ origin: invoiceOrigin, companyId }) },
      { result: "undefined" },
      null,
      null,
      new Error("wait timed out"),
      invoiceSaveRequest(77, 200),
      null,
    ]);
    try {
      await expect(
        withFreeeBrowser(browserScope, (browser) => browser.postInvoiceDeal(77)),
      ).resolves.toBeUndefined();
    } finally {
      spawn.mockRestore();
    }
  });

  test("請求書の保存操作後に通信結果を確認できなければ結果不明とする", async () => {
    Bun.env.AGENT_BROWSER_ENCRYPTION_KEY = encryptionKey;
    const { spawn } = mockAgentBrowser([
      null,
      { result: JSON.stringify({ origin, companyId }) },
      null,
      { result: JSON.stringify({ origin: invoiceOrigin }) },
      { result: JSON.stringify({ origin: invoiceOrigin, companyId }) },
      { result: "undefined" },
      null,
      null,
      new Error("wait timed out"),
      { requests: [] },
      null,
    ]);
    try {
      const result = withFreeeBrowser(browserScope, (browser) => browser.postInvoiceDeal(77));
      await expect(result).rejects.toBeInstanceOf(OutcomeUnknownError);
      await expect(result).rejects.toMatchObject({ code: "OUTCOME_UNKNOWN" });
    } finally {
      spawn.mockRestore();
    }
  });

  test("請求書登録後の会計操作では会計画面と事業所を再確認する", async () => {
    Bun.env.AGENT_BROWSER_ENCRYPTION_KEY = encryptionKey;
    const { commands, spawn } = mockAgentBrowser([
      null,
      { result: JSON.stringify({ origin, companyId }) },
      null,
      { result: JSON.stringify({ origin: invoiceOrigin }) },
      { result: JSON.stringify({ origin: invoiceOrigin, companyId }) },
      { result: "undefined" },
      null,
      null,
      null,
      invoiceSaveRequest(77, 200),
      null,
      { result: JSON.stringify({ origin, companyId }) },
      webResponse({
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
      }),
      null,
    ]);
    try {
      await expect(
        withFreeeBrowser(browserScope, async (browser) => {
          await browser.postInvoiceDeal(77);
          return browser.walletTransaction(42);
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
    const { commands, spawn } = mockAgentBrowser([
      null,
      { result: JSON.stringify({ origin, companyId }) },
      webResponse({ wallet_txn: { id: 42, status: 1 } }),
      null,
    ]);
    try {
      const result = withFreeeBrowser(browserScope, (browser) =>
        browser.registerWalletTransaction(registration),
      );
      await expect(result).rejects.toBeInstanceOf(OutcomeUnknownError);
      await expect(result).rejects.toMatchObject({ code: "OUTCOME_UNKNOWN" });
    } finally {
      spawn.mockRestore();
    }
    expect(commands.at(-1)?.at(-1)).toBe("close");
  });

  test("書き込みの5xxは結果不明、4xxは確定失敗とする", async () => {
    Bun.env.AGENT_BROWSER_ENCRYPTION_KEY = encryptionKey;
    const { spawn } = mockAgentBrowser([
      null,
      { result: JSON.stringify({ origin, companyId }) },
      webResponse({ error: "failed" }, 500),
      webResponse({ error: "invalid" }, 400),
      null,
    ]);
    try {
      await withFreeeBrowser(browserScope, async (browser) => {
        await expect(browser.ignoreWalletTransaction(walletTransaction)).rejects.toBeInstanceOf(
          OutcomeUnknownError,
        );
        await expect(browser.ignoreWalletTransaction(walletTransaction)).rejects.toThrow(
          "HTTP 400",
        );
      });
    } finally {
      spawn.mockRestore();
    }
  });

  test("書き込み通信の確認を失ったら結果不明とする", async () => {
    Bun.env.AGENT_BROWSER_ENCRYPTION_KEY = encryptionKey;
    const { spawn } = mockAgentBrowser([
      null,
      { result: JSON.stringify({ origin, companyId }) },
      new Error("Agent Browser timed out."),
      null,
    ]);
    try {
      const result = withFreeeBrowser(browserScope, (browser) =>
        browser.ignoreWalletTransaction(walletTransaction),
      );
      await expect(result).rejects.toBeInstanceOf(OutcomeUnknownError);
      await expect(result).rejects.toMatchObject({ code: "OUTCOME_UNKNOWN" });
    } finally {
      spawn.mockRestore();
    }
  });

  test("書き込み成功後のsession cleanup失敗で成功を上書きしない", async () => {
    Bun.env.AGENT_BROWSER_ENCRYPTION_KEY = encryptionKey;
    const { spawn } = mockAgentBrowser([
      null,
      { result: JSON.stringify({ origin, companyId }) },
      webResponse({ wallet_txn: { id: 42, status: 2 } }),
      new Error("close failed"),
    ]);
    try {
      await expect(
        withFreeeBrowser(browserScope, (browser) =>
          browser.registerWalletTransaction(registration),
        ),
      ).resolves.toEqual({ walletTransactionId: 42 });
    } finally {
      spawn.mockRestore();
    }
  });

  test("session cleanup失敗後も同じscopeを再取得できる", async () => {
    Bun.env.AGENT_BROWSER_ENCRYPTION_KEY = encryptionKey;
    const { spawn } = mockAgentBrowser([
      null,
      { result: JSON.stringify({ origin, companyId }) },
      new Error("close failed"),
      null,
      { result: JSON.stringify({ origin, companyId }) },
      null,
    ]);
    try {
      await expect(withFreeeBrowser(browserScope, async () => "first")).resolves.toBe("first");
      await expect(withFreeeBrowser(browserScope, async () => "second")).resolves.toBe("second");
    } finally {
      spawn.mockRestore();
    }
  });
});
