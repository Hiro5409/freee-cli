import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { createContext, runInContext } from "node:vm";

import { OutcomeUnknownError } from "../../errors.ts";
import { type FreeeWebScope, loginFreeeWeb, freeeWebStatus, withFreeeWeb } from "./freee-web.ts";

const companyId = 1_234_567;
let webScope: FreeeWebScope;
const invoiceOrigin = "https://invoice.secure.freee.co.jp";
const loginOrigin = "https://accounts.secure.freee.co.jp";
const csrfToken = "csrf-token-value";
const encryptionKey = "a".repeat(64);
const previousEncryptionKey = Bun.env.AGENT_BROWSER_ENCRYPTION_KEY;
const previousHome = Bun.env.HOME;
const previousUserProfile = Bun.env.USERPROFILE;

// Session locks live in a machine-wide directory, so each test owns its CLI profile.
beforeEach(() => {
  webScope = { companyId, profile: `test-${randomUUID()}` };
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

function requestMatching(requests: PageRequest[], method: string, path: string, occurrence = 0) {
  const matches = requests.filter((request) => request.method === method && request.path === path);
  const request = matches[occurrence];
  if (!request) throw new Error(`request not found: ${method} ${path}`);
  return request;
}

describe("Agent Browserのfreeeセッション", () => {
  test("ログイン待ちの期限切れは再実行手順を示し認証を保存しない", async () => {
    Bun.env.AGENT_BROWSER_ENCRYPTION_KEY = encryptionKey;
    const { commands, spawn } = mockAgentBrowser(freeePage(), (command) => {
      if (command.includes("wait")) throw new Error("Wait timed out after 300000ms");
      return null;
    });
    try {
      await expect(loginFreeeWeb(webScope)).rejects.toMatchObject({
        code: "AUTHENTICATION",
        hint: `freee auth login --web --profile ${webScope.profile}`,
      });
      expect(commands.at(-1)).toContain("never");
    } finally {
      spawn.mockRestore();
    }
  });
  test.each([
    ["ready", "https://secure.freee.co.jp", companyId],
    ["login_required", loginOrigin, 0],
    ["company_mismatch", "https://secure.freee.co.jp", 999],
  ] as const)(
    "状態確認は %s を判定し、正常な認証だけ保存する",
    async (status, origin, actualCompanyId) => {
      Bun.env.AGENT_BROWSER_ENCRYPTION_KEY = encryptionKey;
      const page = freeePage();
      page.meta["company-id"] = String(actualCompanyId);
      const { commands, spawn } = mockAgentBrowser(page, (command) => {
        if (command.includes("open")) page.origin = origin;
        return null;
      });
      try {
        await expect(freeeWebStatus(webScope)).resolves.toMatchObject({
          status,
          actualCompanyId: actualCompanyId || null,
        });
        expect(page.requests).toHaveLength(0);
        expect(commands.at(-1)).toContain(status === "ready" ? "always" : "never");
      } finally {
        spawn.mockRestore();
      }
    },
  );
  test("ログイン操作でブラウザを表示し本人操作後に対象事業所を確認して保存する", async () => {
    Bun.env.AGENT_BROWSER_ENCRYPTION_KEY = encryptionKey;
    const page = freeePage();
    let loggedIn = false;
    const { commands, spawn } = mockAgentBrowser(page, (command) => {
      if (command.includes("open") && !loggedIn) page.origin = loginOrigin;
      if (command.includes("wait")) {
        loggedIn = true;
        page.origin = "https://secure.freee.co.jp";
      }
      return null;
    });
    try {
      await expect(loginFreeeWeb(webScope)).resolves.toMatchObject({ status: "ready", companyId });
      const open = commands.find((command) => command.includes("open"));
      expect(open?.[open.indexOf("--headed") + 1]).toBe("true");
      expect(commands.at(-1)).toContain("always");
      expect(commands.some((command) => command.includes("auth"))).toBe(false);
    } finally {
      spawn.mockRestore();
    }
  });
  test("期限切れなら保存パスワードで再ログインせず処理前に停止する", async () => {
    Bun.env.AGENT_BROWSER_ENCRYPTION_KEY = encryptionKey;
    const page = freeePage();
    let executed = false;
    const { commands, spawn } = mockAgentBrowser(page, (command) => {
      if (command.includes("open")) page.origin = loginOrigin;
      return null;
    });
    try {
      await expect(
        withFreeeWeb(webScope, async () => {
          executed = true;
        }),
      ).rejects.toThrow("freee auth login --web --profile");
      expect(executed).toBe(false);
      expect(commands.some((command) => command.includes("auth"))).toBe(false);
    } finally {
      spawn.mockRestore();
    }
  });
  test("暗号鍵がなければweb stateを復元しない", async () => {
    delete Bun.env.AGENT_BROWSER_ENCRYPTION_KEY;
    delete Bun.env.HOME;
    delete Bun.env.USERPROFILE;
    await expect(withFreeeWeb(webScope, async () => undefined)).rejects.toThrow("not initialized");
  });

  test("事業所が違えば操作せず同じCLIプロファイルのログインを案内する", async () => {
    Bun.env.AGENT_BROWSER_ENCRYPTION_KEY = encryptionKey;
    const page = freeePage();
    page.meta["company-id"] = "999";
    const { commands, spawn } = mockAgentBrowser(page);
    try {
      await expect(
        withFreeeWeb(webScope, async () => {
          throw new Error("must not execute");
        }),
      ).rejects.toThrow(`freee auth login --web --profile ${webScope.profile}`);
      expect(
        commands
          .filter((command) => command.includes("close"))
          .every((command) => command.includes("never")),
      ).toBe(true);
    } finally {
      spawn.mockRestore();
    }
  });

  test("口座同期は対象事業所の内部APIへ送信する", async () => {
    Bun.env.AGENT_BROWSER_ENCRYPTION_KEY = encryptionKey;
    const page = freeePage([
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
        expect((await web.walletableSummary()).walletables[0]).toMatchObject({
          id: 7,
          name: "銀行",
          type: "bank_account",
        });
        await web.startWalletableSync("bank_account", 7);
        await expect(web.walletableSyncState("bank_account", 7)).resolves.toMatchObject({
          status: "synced",
          lastSyncedAt: "2026-08-24T01:10:00.000Z",
        });
        await web.startBulkWalletableSync();
      });
    } finally {
      spawn.mockRestore();
    }
    expect(page.requests.map(({ method, path }) => ({ method, path }))).toEqual([
      { method: "GET", path: "/api/p/v2/walletables/summary" },
      { method: "PUT", path: "/api/p/v2/walletables/bank_account/7/sync" },
      { method: "GET", path: "/api/p/v2/walletables/bank_account/7/sync_status" },
      { method: "PUT", path: "/api/p/v2/walletables/sync_all" },
    ]);
    expect(
      requestMatching(page.requests, "PUT", "/api/p/v2/walletables/bank_account/7/sync").headers,
    ).toMatchObject({ "x-csrf-token": csrfToken, accept: "application/json" });
    expect(commands.at(-1)?.at(-1)).toBe("close");
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
        return web.startWalletableSync("bank_account", 7);
      }).catch((cause: unknown) => cause);
      expect(error).toBeInstanceOf(Error);
      expect(error).not.toBeInstanceOf(OutcomeUnknownError);
      expect((error as Error).message).toContain(message);
    } finally {
      spawn.mockRestore();
    }
    expect(page.requests).toEqual([]);
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

    expect(page.origin).toBe("https://secure.freee.co.jp");
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
      { body: { walletable_status: "synced", last_synced_at: null, sync_failed_reason: null } },
    ]);
    const { commands, spawn } = mockAgentBrowser(page, observedInvoiceSave(200));
    try {
      await expect(
        withFreeeWeb(webScope, async (web) => {
          await web.registerInvoiceDeal(77);
          return web.walletableSyncState("bank_account", 7);
        }),
      ).resolves.toMatchObject({ status: "synced" });
    } finally {
      spawn.mockRestore();
    }
    expect(
      commands.filter(
        (command) => command.includes("open") && command.includes("https://secure.freee.co.jp/"),
      ),
    ).toHaveLength(3);
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
        await expect(web.startWalletableSync("bank_account", 7)).rejects.toBeInstanceOf(
          OutcomeUnknownError,
        );
        await expect(web.startWalletableSync("bank_account", 7)).rejects.toThrow("HTTP 400");
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
      const result = withFreeeWeb(webScope, (web) => web.startWalletableSync("bank_account", 7));
      await expect(result).rejects.toBeInstanceOf(OutcomeUnknownError);
      await expect(result).rejects.toMatchObject({ code: "OUTCOME_UNKNOWN" });
    } finally {
      spawn.mockRestore();
    }
    expect(page.requests.map(({ method, path }) => ({ method, path }))).toEqual([
      { method: "PUT", path: "/api/p/v2/walletables/bank_account/7/sync" },
    ]);
  });

  test("書き込み成功後のsession cleanup失敗で成功を上書きしない", async () => {
    Bun.env.AGENT_BROWSER_ENCRYPTION_KEY = encryptionKey;
    const { spawn } = mockAgentBrowser(freeePage([{ body: {} }]), (command) => {
      if (command.at(-1) === "close") throw new Error("close failed");
      return null;
    });
    try {
      await expect(
        withFreeeWeb(webScope, (web) => web.startWalletableSync("bank_account", 7)),
      ).resolves.toBeUndefined();
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
