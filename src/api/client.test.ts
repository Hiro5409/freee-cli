import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { HttpResponse, http, passthrough } from "msw";
import { setupServer } from "msw/node";

import { loadCredentials, saveCredentials, updateCredentials } from "../config/credentials.ts";
import { errorHints } from "../errors.ts";
import { handleGetDeals } from "../types/freee/msw.gen.ts";
import { client, configureClient, hrClient, invoiceClient } from "./client.ts";

const testDir = join(tmpdir(), `freee-cli-client-test-${Date.now()}`);

const MOCK_TOKEN = {
  clientId: "test-client",
  clientSecret: "test-secret",
  accessToken: "test-access-token",
  refreshToken: "test-refresh-token",
  expiresAt: Date.now() + 3600000,
};

const server = setupServer(
  handleGetDeals({
    body: { deals: [], meta: { total_count: 0 } },
  }),
);

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterAll(() => server.close());

beforeEach(() => {
  mkdirSync(testDir, { recursive: true });
  saveCredentials(testDir, { default: MOCK_TOKEN });
});

afterEach(() => {
  server.resetHandlers();
  client.setConfig({
    baseUrl: "https://api.freee.co.jp",
    fetch: undefined,
    throwOnError: true,
  });
  client.interceptors.request.clear();
  client.interceptors.response.clear();
  client.interceptors.error.clear();
  invoiceClient.interceptors.request.clear();
  invoiceClient.interceptors.response.clear();
  invoiceClient.interceptors.error.clear();
  hrClient.interceptors.request.clear();
  hrClient.interceptors.response.clear();
  hrClient.interceptors.error.clear();
  rmSync(testDir, { recursive: true, force: true });
});

describe("API client", () => {
  test("configured client adds Authorization header via SDK function", async () => {
    server.use(
      handleGetDeals(async ({ request }) => {
        const auth = request.headers.get("Authorization");
        expect(auth).toBe("Bearer test-access-token");
        return HttpResponse.json({ deals: [], meta: { total_count: 0 } });
      }),
    );
    configureClient(testDir, "default");

    const { getDeals } = await import("../types/freee/sdk.gen.ts");
    const { data } = await getDeals({ query: { company_id: 1 } });
    expect(data).toHaveProperty("deals");
  });

  test("configured client authorizes the freee invoice API, which has its own base URL", async () => {
    server.use(
      http.get("https://api.freee.co.jp/iv/invoices", ({ request }) => {
        expect(request.headers.get("Authorization")).toBe("Bearer test-access-token");
        return HttpResponse.json({ invoices: [] });
      }),
    );
    configureClient(testDir, "default");

    const { invoicesIndex } = await import("../types/freee-invoice/sdk.gen.ts");
    const { data } = await invoicesIndex({ query: { company_id: 1 } });
    expect(data).toHaveProperty("invoices");
  });

  test("configured client authorizes the freee HR API, which has its own base URL", async () => {
    server.use(
      http.get("https://api.freee.co.jp/hr/api/v1/users/me", ({ request }) => {
        expect(request.headers.get("Authorization")).toBe("Bearer test-access-token");
        return HttpResponse.json({ companies: [] });
      }),
    );
    configureClient(testDir, "default");

    const { data } = await hrClient.get({ url: "/api/v1/users/me" });
    expect(data).toHaveProperty("companies");
  });

  test("raw client.post sends Authorization without explicit security option", async () => {
    server.use(
      http.post("*/api/1/deals", async ({ request }) => {
        const auth = request.headers.get("Authorization");
        expect(auth).toBe("Bearer test-access-token");
        expect(await request.json()).toEqual({ test: true });
        return HttpResponse.json({ deals: [] });
      }),
    );
    configureClient(testDir, "default");

    const { data } = await client.post({
      url: "/api/1/deals",
      body: { test: true },
    });
    expect(data).toHaveProperty("deals");
  });

  test("configured client throws on 4xx (throwOnError enabled by configureClient)", async () => {
    server.use(
      http.get("*/api/1/error", () => HttpResponse.json({ message: "Not Found" }, { status: 404 })),
    );
    configureClient(testDir, "default");

    await expect(client.get({ url: "/api/1/error" })).rejects.toMatchObject({
      code: "NOT_FOUND",
      exitCode: 1,
    });
  });

  test("configured invoice client preserves HTTP error details and product-specific guidance", async () => {
    // Exercise a real response stream: Bun/MSW JSON fixtures can expose an empty reader.
    const api = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      fetch: () =>
        Response.json(
          {
            status_code: 403,
            errors: [{ type: "status", messages: ["この操作を行う権限がありません。"] }],
          },
          { status: 403 },
        ),
    });
    server.use(http.get(new URL("error", api.url).href, passthrough));
    configureClient(testDir, "default");

    try {
      await expect(
        invoiceClient.get({ baseUrl: api.url.origin, url: "/error" }),
      ).rejects.toMatchObject({
        code: "ACCESS_DENIED",
        exitCode: 2,
        hint: errorHints.invoiceAccess,
        message: expect.stringContaining("この操作を行う権限がありません。"),
      });
    } finally {
      await api.stop(true);
    }
  });

  test("configured client retries read-only transient responses", async () => {
    let callCount = 0;
    server.use(
      http.get("*/api/1/deals", () => {
        callCount++;
        if (callCount < 3) {
          return HttpResponse.json(
            { message: "Too Many Requests" },
            { headers: { "Retry-After": "0" }, status: 429 },
          );
        }
        return HttpResponse.json({ deals: [], meta: { total_count: 0 } });
      }),
    );
    configureClient(testDir, "default");

    const { data } = await client.get({ url: "/api/1/deals" });

    expect(data).toHaveProperty("deals");
    expect(callCount).toBe(3);
  });

  test.each(["post", "put", "patch", "delete"] as const)(
    "configured client never retries %s writes",
    async (method) => {
      let callCount = 0;
      server.use(
        http[method]("*/api/1/deals", () => {
          callCount++;
          return HttpResponse.json(
            { message: "Too Many Requests" },
            { headers: { "Retry-After": "0" }, status: 429 },
          );
        }),
      );
      configureClient(testDir, "default");

      await expect(
        client[method]({ url: "/api/1/deals", body: { test: true } }),
      ).rejects.toMatchObject({
        code: "RATE_LIMITED",
      });
      expect(callCount).toBe(1);
    },
  );

  test("configured client reports the final network failure after a transient HTTP error", async () => {
    server.use(
      http.get(
        "*/api/1/deals",
        () =>
          HttpResponse.json(
            { message: "Too Many Requests" },
            { headers: { "Retry-After": "0" }, status: 429 },
          ),
        { once: true },
      ),
      http.get("*/api/1/deals", () => HttpResponse.error()),
    );
    configureClient(testDir, "default");

    await expect(client.get({ url: "/api/1/deals" })).rejects.toMatchObject({
      code: "UPSTREAM_FAILURE",
    });
  });
});

describe("token refresh deduplication", () => {
  test("reloads credentials after waiting for another refresh", async () => {
    const expiredToken = {
      ...MOCK_TOKEN,
      expiresAt: Date.now() - 1000,
    };
    saveCredentials(testDir, { default: expiredToken });

    let signalLockHeld: (() => void) | undefined;
    let releaseLock: (() => void) | undefined;
    const lockHeld = new Promise<void>((resolve) => {
      signalLockHeld = resolve;
    });
    const canReleaseLock = new Promise<void>((resolve) => {
      releaseLock = resolve;
    });

    const otherRefresh = updateCredentials(testDir, async (credentials) => {
      signalLockHeld?.();
      await canReleaseLock;
      credentials.default = {
        ...expiredToken,
        accessToken: "other-process-access",
        refreshToken: "other-process-refresh",
        expiresAt: Date.now() + 3600000,
      };
    });
    await lockHeld;

    let refreshCount = 0;
    const requestAuthorizations: Array<string | null> = [];
    server.use(
      http.post("*/public_api/token", () => {
        refreshCount++;
        return HttpResponse.json({
          access_token: "unexpected-refresh",
          refresh_token: "unexpected-refresh-token",
          expires_in: 3600,
        });
      }),
      http.get("*/api/1/deals", ({ request }) => {
        requestAuthorizations.push(request.headers.get("Authorization"));
        return HttpResponse.json({ deals: [], meta: { total_count: 0 } });
      }),
    );
    configureClient(testDir, "default");

    const request = client.get({ url: "/api/1/deals" });
    await Bun.sleep(25);
    releaseLock?.();
    await Promise.all([otherRefresh, request]);

    expect(refreshCount).toBe(0);
    expect(requestAuthorizations).toEqual(["Bearer other-process-access"]);
  });

  test("concurrent requests with expired token trigger refresh only once", async () => {
    const expiredToken = {
      ...MOCK_TOKEN,
      expiresAt: Date.now() - 1000,
    };
    saveCredentials(testDir, { default: expiredToken });

    let refreshCount = 0;
    server.use(
      http.post("*/public_api/token", () => {
        refreshCount++;
        return HttpResponse.json({
          access_token: "refreshed-token",
          refresh_token: "new-refresh-token",
          expires_in: 3600,
        });
      }),
      http.get("*/api/1/deals", async ({ request }) => {
        const auth = request.headers.get("Authorization");
        expect(auth).toBe("Bearer refreshed-token");
        return HttpResponse.json({ deals: [], meta: { total_count: 0 } });
      }),
    );

    configureClient(testDir, "default");

    await Promise.all(Array.from({ length: 5 }, () => client.get({ url: "/api/1/deals" })));

    expect(refreshCount).toBe(1);

    const saved = loadCredentials(testDir).default;
    expect(saved?.refreshToken).toBe("new-refresh-token");
    expect(saved?.accessToken).toBe("refreshed-token");
  });

  test("refresh failure rejects all waiters and allows retry on next request", async () => {
    const expiredToken = {
      ...MOCK_TOKEN,
      expiresAt: Date.now() - 1000,
    };
    saveCredentials(testDir, { default: expiredToken });

    let callCount = 0;
    server.use(
      http.post("*/public_api/token", () => {
        callCount++;
        if (callCount === 1) {
          return HttpResponse.json({ error: "invalid_grant" }, { status: 401 });
        }
        return HttpResponse.json({
          access_token: "retry-token",
          refresh_token: "retry-refresh",
          expires_in: 3600,
        });
      }),
      http.get("*/api/1/deals", () => HttpResponse.json({ deals: [], meta: { total_count: 0 } })),
    );

    configureClient(testDir, "default");

    const results = await Promise.allSettled(
      Array.from({ length: 5 }, () => client.get({ url: "/api/1/deals" })),
    );
    expect(results.every((r) => r.status === "rejected")).toBe(true);
    for (const result of results) {
      if (result.status === "fulfilled") throw new Error("expected refresh failure");
      expect(String(result.reason)).toContain("freee login --profile default --replace");
    }
    expect(callCount).toBe(1);

    const { data } = await client.get({ url: "/api/1/deals" });
    expect(data).toHaveProperty("deals");
    expect(callCount).toBe(2);
  });
});
