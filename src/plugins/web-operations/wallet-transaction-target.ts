import type { FreeeWebWalletTransaction } from "./freee-web.ts";

export function identifyWalletTransactionTarget(
  walletTransaction: FreeeWebWalletTransaction,
  expected: { id: number; companyId: number },
  invalid: (message: string) => Error,
) {
  if (walletTransaction.id !== expected.id) {
    throw invalid("freee Web returned another wallet transaction.");
  }
  if (walletTransaction.companyId !== expected.companyId) {
    throw invalid(
      `Wallet transaction ${walletTransaction.id} does not belong to company ${expected.companyId}.`,
    );
  }

  return {
    id: walletTransaction.id,
    date: walletTransaction.date,
    description: walletTransaction.description,
    amount:
      walletTransaction.entrySide === "income"
        ? walletTransaction.receivedAmount
        : walletTransaction.spentAmount,
    entrySide: walletTransaction.entrySide,
    walletableId: walletTransaction.walletableId,
    walletableName: walletTransaction.walletableName,
    updatedAt: walletTransaction.updatedAt,
  };
}
