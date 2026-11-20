import { define } from "gunshi";
import { args, integer, merge, multiple, required, string } from "gunshi/combinators";
import * as v from "valibot";

import { parseCliInput } from "../../cli-input.ts";
import { CliError } from "../../errors.ts";
import { companyArgs } from "../../global-args.ts";
import { initCommand } from "../../helpers.ts";
import {
  applyUserMatchers,
  createWalletTxnDeal,
  createWalletTxnPrivateDeal,
  createWalletTxnTransfer,
  ignoreWalletTxn,
  reconcileWalletTxn,
  resetWalletTxn,
} from "../../types/freee/sdk.gen.ts";
import type {
  CreateWalletTxnDealData,
  CreateWalletTxnTransferData,
  ReconcileWalletTxnData,
} from "../../types/freee/types.gen.ts";

const transactionArgs = merge(
  companyArgs,
  args({
    id: required(
      integer({ min: 1, max: Number.MAX_SAFE_INTEGER, description: "Wallet transaction ID" }),
    ),
  }),
);

function invalid(message: string): CliError {
  return new CliError(message, {
    code: "INVALID_INPUT",
    hint: 'Read the selected statement with "freee wallet-txn show" and correct the request.',
  });
}

export const walletTransactionIgnoreCommand = define({
  name: "ignore",
  description: "Ignore a wallet transaction",
  args: transactionArgs,
  run: async (ctx) => {
    const { companyId } = initCommand(ctx);
    await ignoreWalletTxn({ path: { id: ctx.values.id }, body: { company_id: companyId } });
    return JSON.stringify({ wallet_txn_id: ctx.values.id, status: 3 });
  },
});

export const walletTransactionResetCommand = define({
  name: "reset",
  description: "Return a wallet transaction to unprocessed",
  args: transactionArgs,
  run: async (ctx) => {
    const { companyId } = initCommand(ctx);
    await resetWalletTxn({ path: { id: ctx.values.id }, body: { company_id: companyId } });
    return JSON.stringify({ wallet_txn_id: ctx.values.id, status: 1 });
  },
});

const bodyArgs = merge(
  transactionArgs,
  args({
    body: required(
      string({
        description:
          "API request body JSON; company_id is supplied by the selected profile or --company-id",
      }),
    ),
  }),
);
const BodySchema = v.pipe(v.string(), v.parseJson(), v.record(v.string(), v.unknown()));

// oxlint-disable-next-line typescript/no-unnecessary-type-parameters -- The caller selects the generated endpoint request type.
function requestBody<T extends { company_id: number }>(value: string, companyId: number): T {
  // freee validates the endpoint schema; preserve optional fields and server defaults.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Only JSON syntax and object shape are validated locally; endpoint validation belongs to freee.
  return { ...parseCliInput(BodySchema, value, { label: "--body" }), company_id: companyId } as T;
}

export const walletTransactionRegisterCommand = define({
  name: "register",
  description: "Create and link Deals from a wallet transaction",
  examples: `freee wallet-txn register --id 42 --body '{"deal_lines":[{"account_item_id":101,"amount":10000}]}'`,
  args: bodyArgs,
  run: async (ctx) => {
    const { companyId } = initCommand(ctx);
    const { data } = await createWalletTxnDeal({
      path: { id: ctx.values.id },
      body: requestBody<CreateWalletTxnDealData["body"]>(ctx.values.body, companyId),
    });
    const result = { wallet_txn_id: ctx.values.id, ...data };
    return JSON.stringify(result);
  },
});

export const walletTransactionRegisterPrivateCommand = define({
  name: "register-private",
  description: "Create and link a private Deal using the company's accounting treatment",
  args: transactionArgs,
  run: async (ctx) => {
    const { companyId } = initCommand(ctx);
    const { data } = await createWalletTxnPrivateDeal({
      path: { id: ctx.values.id },
      body: { company_id: companyId },
    });
    return JSON.stringify({ wallet_txn_id: ctx.values.id, ...data });
  },
});

export const walletTransactionSettleCommand = define({
  name: "settle",
  description: "Reconcile a wallet transaction with existing Deals and an optional adjustment Deal",
  examples: `freee wallet-txn settle --id 42 --body '{"deals":[{"deal_id":91,"amount":10000}]}'`,
  args: bodyArgs,
  run: async (ctx) => {
    const { companyId } = initCommand(ctx);
    const { data } = await reconcileWalletTxn({
      path: { id: ctx.values.id },
      body: requestBody<ReconcileWalletTxnData["body"]>(ctx.values.body, companyId),
    });
    return JSON.stringify(data);
  },
});

export const walletTransactionTransferCommand = define({
  name: "transfer",
  description: "Create transfers and optional fee entries from a wallet transaction",
  examples: `freee wallet-txn transfer --id 42 --body '{"transfer_from_line":{"walletable_id":1,"walletable_type":"bank_account"},"transfer_to_lines":[{"walletable_id":2,"walletable_type":"wallet","amount":10000}]}'`,
  args: bodyArgs,
  run: async (ctx) => {
    const { companyId } = initCommand(ctx);
    const { data } = await createWalletTxnTransfer({
      path: { id: ctx.values.id },
      body: requestBody<CreateWalletTxnTransferData["body"]>(ctx.values.body, companyId),
    });
    return JSON.stringify(data);
  },
});

export const walletTransactionApplyRulesCommand = define({
  name: "apply-rules",
  description: "Queue automatic rules for explicitly selected statement IDs",
  args: merge(
    companyArgs,
    args({
      id: required(
        multiple(
          integer({
            min: 1,
            max: Number.MAX_SAFE_INTEGER,
            description: "Wallet transaction ID; repeatable, up to 1000",
          }),
        ),
      ),
    }),
  ),
  run: async (ctx) => {
    const { companyId } = initCommand(ctx);
    const ids = [...new Set(ctx.values.id)];
    if (ids.length > 1000)
      throw invalid("At most 1000 statement IDs can be submitted per request.");
    await applyUserMatchers({ body: { company_id: companyId, wallet_txn_ids: ids } });
    return JSON.stringify({ wallet_txn_ids: ids, status: "queued" });
  },
});
