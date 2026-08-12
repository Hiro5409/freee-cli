import { describe, expect, test } from "bun:test";

import { CliError, errorHints } from "../../errors.ts";
import { invoiceApiError } from "./invoice-api-error.ts";

describe("invoiceApiError", () => {
  test("403 は請求書API権限の不足として説明する", () => {
    const err = invoiceApiError({
      status_code: 403,
      errors: [{ type: "status", messages: ["この操作を行う権限がありません。"] }],
    });

    expect(err).toBeInstanceOf(CliError);
    expect(err.hint).toBe(errorHints.invoiceAccess);
    expect(err.exitCode).toBe(2);
    expect(err.message).toContain("この操作を行う権限がありません。");
    expect(err.why).toContain("請求書");
  });

  test("400 は freee のメッセージをそのまま見せる", () => {
    const err = invoiceApiError({
      status_code: 400,
      errors: [{ type: "invalid", messages: ["billing_dateは必須です。", "linesは必須です。"] }],
    });

    expect(err.hint).toBe(errorHints.invalidValue);
    expect(err.message).toContain("billing_dateは必須です。");
    expect(err.message).toContain("linesは必須です。");
  });

  test("401 は認証エラーとして扱う", () => {
    const err = invoiceApiError({ message: "The access token is invalid" });

    expect(err.hint).toBe(errorHints.authentication);
    expect(err.exitCode).toBe(2);
    expect(err.message).toContain("The access token is invalid");
  });

  test("すでに CliError ならそのまま通す", () => {
    const original = new CliError("boom", { exitCode: 9, hint: errorHints.company });

    expect(invoiceApiError(original)).toBe(original);
  });

  test("見知らぬ形なら中身を落とさず包む", () => {
    const err = invoiceApiError({ weird: true });

    expect(err).toBeInstanceOf(CliError);
    expect(err.hint).toBe(errorHints.invalidValue);
    expect(err.message).toContain("weird");
  });

  test("Error インスタンスはメッセージを保つ", () => {
    const err = invoiceApiError(new TypeError("network down"));

    expect(err).toBeInstanceOf(CliError);
    expect(err.message).toContain("network down");
  });
});
