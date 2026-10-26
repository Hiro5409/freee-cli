import { afterAll, afterEach, beforeAll, beforeEach, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { cli } from "gunshi";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";

import { MOCK_TOKEN } from "../../../test/credentials.ts";
import { saveCredentials } from "../../config/credentials.ts";
import { walletTransactionIgnoreCommand } from "./process.ts";

const directory = mkdtempSync(join(tmpdir(), "freee-wallet-process-"));
const previousDirectory = process.env.FREEE_CLI_CONFIG_DIR;
const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterAll(() => {
  server.close();
  rmSync(directory, { recursive: true, force: true });
});
beforeEach(() => {
  saveCredentials(directory, { default: MOCK_TOKEN });
  process.env.FREEE_CLI_CONFIG_DIR = directory;
});
afterEach(() => {
  server.resetHandlers();
  if (previousDirectory === undefined) delete process.env.FREEE_CLI_CONFIG_DIR;
  else process.env.FREEE_CLI_CONFIG_DIR = previousDirectory;
});
const base = ["--company-id", "123", "--id", "7", "--format", "json"];

test("ignore posts directly to the official API", async () => {
  let writes = 0;
  server.use(
    http.post("https://api.freee.co.jp/api/1/wallet_txns/7/ignore", async ({ request }) => {
      expect(request.headers.get("Authorization")).toBe("Bearer test-token");
      expect(await request.json()).toEqual({ company_id: 123 });
      writes++;
      return new HttpResponse(null, { status: 200 });
    }),
  );
  const result = await cli(base, walletTransactionIgnoreCommand);
  expect(JSON.parse(String(result))).toEqual({ wallet_txn_id: 7, status: 3 });
  expect(writes).toBe(1);
});

test("reset returns a reconciled statement to unprocessed through the official API", async () => {
  const { walletTransactionResetCommand } = await import("./process.ts");
  server.use(
    http.post("https://api.freee.co.jp/api/1/wallet_txns/7/reset", async ({ request }) => {
      expect(await request.json()).toEqual({ company_id: 123 });
      return new HttpResponse(null, { status: 200 });
    }),
  );
  expect(JSON.parse(String(await cli(base, walletTransactionResetCommand)))).toEqual({
    wallet_txn_id: 7,
    status: 1,
  });
});

test.each(["json", "default"])(
  "registration preserves API options and tax defaults in split accounting lines (%s output)",
  async (format) => {
    const outputArgs = format === "json" ? base : base.slice(0, -2);
    const { walletTransactionRegisterCommand } = await import("./process.ts");
    const lines = [
      { account_item_id: 101, amount: 4000, section_id: 20, tag_ids: [30], description: "Office" },
      { account_item_id: 102, tax_code: 2, amount: 1000, description: "Private" },
    ];
    server.use(
      http.post("https://api.freee.co.jp/api/1/wallet_txns/7/create_deal", async ({ request }) => {
        expect(await request.json()).toEqual({
          company_id: 123,
          issue_date: "2026-07-31",
          ref: "REF-001",
          partner_id: 40,
          deal_lines: lines,
        });
        return HttpResponse.json({ deal_ids: [91] });
      }),
    );
    const result = await cli(
      [
        ...outputArgs,
        "--body",
        JSON.stringify({
          issue_date: "2026-07-31",
          ref: "REF-001",
          partner_id: 40,
          deal_lines: lines,
        }),
      ],
      walletTransactionRegisterCommand,
    );
    const expected = { wallet_txn_id: 7, deal_ids: [91] };
    if (format === "json") expect(JSON.parse(String(result))).toEqual(expected);
    else expect(String(result)).toContain(JSON.stringify(expected, null, 2));
  },
);

test("private registration uses freee's company-specific private accounting treatment", async () => {
  const { walletTransactionRegisterPrivateCommand } = await import("./process.ts");
  server.use(
    http.post(
      "https://api.freee.co.jp/api/1/wallet_txns/7/create_private_deal",
      async ({ request }) => {
        expect(await request.json()).toEqual({ company_id: 123 });
        return HttpResponse.json({ deal_id: 92 });
      },
    ),
  );
  expect(JSON.parse(String(await cli(base, walletTransactionRegisterPrivateCommand)))).toEqual({
    wallet_txn_id: 7,
    deal_id: 92,
  });
});

test.each(["json", "default"])(
  "settlement supports multiple partial payments and an adjustment Deal (%s output)",
  async (format) => {
    const outputArgs = format === "json" ? base : base.slice(0, -2);
    const { walletTransactionSettleCommand } = await import("./process.ts");
    const body = {
      deals: [
        { deal_id: 91, amount: 2000 },
        { deal_id: 92, amount: 2500 },
      ],
      adjustment_deal: { deal_lines: [{ account_item_id: 101, amount: 500 }] },
    };
    server.use(
      http.post("https://api.freee.co.jp/api/1/wallet_txns/7/reconcile", async ({ request }) => {
        expect(await request.json()).toEqual({ company_id: 123, ...body });
        return HttpResponse.json({ wallet_txn_id: 7, deal_ids: [91, 92], new_deal_id: 93 });
      }),
    );
    const result = await cli(
      [...outputArgs, "--body", JSON.stringify(body)],
      walletTransactionSettleCommand,
    );
    const expected = { wallet_txn_id: 7, deal_ids: [91, 92], new_deal_id: 93 };
    if (format === "json") expect(JSON.parse(String(result))).toEqual(expected);
    else expect(String(result)).toContain(JSON.stringify(expected, null, 2));
  },
);

test.each(["json", "default"])(
  "transfer supports multiple destinations, fees and wallet tags (%s output)",
  async (format) => {
    const outputArgs = format === "json" ? base : base.slice(0, -2);
    const { walletTransactionTransferCommand } = await import("./process.ts");
    const body = {
      transfer_from_line: {
        walletable_id: 55,
        walletable_type: "credit_card",
        walletable_tags: { tag_ids: [10] },
      },
      transfer_to_lines: [
        { walletable_id: 66, walletable_type: "bank_account", amount: 3000 },
        { walletable_id: 67, walletable_type: "wallet", amount: 1800, description: "Cash" },
      ],
      charge_lines: [{ account_item_id: 101, amount: 200, line_type: "paid" }],
    };
    server.use(
      http.post(
        "https://api.freee.co.jp/api/1/wallet_txns/7/create_transfer",
        async ({ request }) => {
          expect(await request.json()).toEqual({ company_id: 123, ...body });
          return HttpResponse.json({ wallet_txn_id: 7, transfer_ids: [93, 94] });
        },
      ),
    );
    const result = await cli(
      [...outputArgs, "--body", JSON.stringify(body)],
      walletTransactionTransferCommand,
    );
    const expected = { wallet_txn_id: 7, transfer_ids: [93, 94] };
    if (format === "json") expect(JSON.parse(String(result))).toEqual(expected);
    else expect(String(result)).toContain(JSON.stringify(expected, null, 2));
  },
);

test("rule application submits IDs without reading their state and reports asynchronous acceptance", async () => {
  const { walletTransactionApplyRulesCommand } = await import("./process.ts");
  server.use(
    http.post("https://api.freee.co.jp/api/1/user_matchers/apply", async ({ request }) => {
      expect(await request.json()).toEqual({ company_id: 123, wallet_txn_ids: [7] });
      return new HttpResponse(null, { status: 200 });
    }),
  );
  const result = await cli(base, walletTransactionApplyRulesCommand);
  expect(JSON.parse(String(result))).toEqual({ wallet_txn_ids: [7], status: "queued" });
});

test("write transport failures remain unknown outcomes without an automatic retry", async () => {
  let writes = 0;
  server.use(
    http.post("https://api.freee.co.jp/api/1/wallet_txns/7/ignore", () => {
      writes++;
      return HttpResponse.error();
    }),
  );
  await expect(cli(base, walletTransactionIgnoreCommand)).rejects.toMatchObject({
    code: "OUTCOME_UNKNOWN",
  });
  expect(writes).toBe(1);
});
