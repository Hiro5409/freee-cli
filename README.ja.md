<h1 align="center">freee-cli</h1>

<p align="center">
  <a href="https://developer.freee.co.jp/">freee API</a> の非公式 CLI。
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/freee-cli"><img src="https://img.shields.io/npm/v/freee-cli" alt="npm version"></a>
  <a href="https://github.com/Hiro5409/freee-cli/actions/workflows/ci.yml"><img src="https://github.com/Hiro5409/freee-cli/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="./LICENSE"><img src="https://img.shields.io/github/license/Hiro5409/freee-cli" alt="License: MIT"></a>
</p>

<p align="center">
  <a href="README.md">English</a> | 日本語
</p>

## なぜCLIなのか

freeeは、すでに[公式MCPサーバー](https://github.com/freee/freee-mcp)を提供しています。
freee-cliを作った理由は、シェルを使えるcoding agentにはCLIの方が優れたインターフェースだと考えているからです。

CLIなら、coding agent、開発者、スクリプト、CIが同じインターフェースを使えます。
コマンドを`--help`で調べ、ファイルやパイプと組み合わせ、不具合の調査では直接実行できます。

そのため、freee-cliは用途固有のワークフローではなく、小さなfreee操作を提供します。
JSON出力、構造化エラー、更新時の`--dry-run`によって、自動化から予測可能に扱えます。

## 公式OpenAPIスキーマへの追従

APIクライアントは、freeeがメンテナンスして公開する[OpenAPIスキーマ](https://github.com/freee/freee-api-schema)から生成します。

## クイックスタート

```bash
bunx freee-cli setup
```

## インストール

```bash
bun add -g freee-cli
```

## 使い方

```bash
freee --help
freee <command> --help
```

### 認証

```bash
freee login --profile personal
freee profile-list
freee company-list
freee company-switch --id 1234567 --name "My Company"
```

### 会計

```bash
freee deal-list --month 2026-08
freee deal-create --date 2026-08-15 --type expense \
  --account-item-id 123 --tax-code 136 --amount 5000 --dry-run
freee wallet-txn-list --month 2026-08 --status unreconciled
freee wallet-txn-show --id 42
freee transfer-list --month 2026-08
freee transfer-create --date 2026-08-01 \
  --from-walletable-id 10 --from-walletable-type bank_account \
  --to '{"type":"credit_card","id":20,"amount":5000}' --dry-run
freee file-box-list --start-date 2026-08-01 --end-date 2026-08-31 --category without-deal
freee file-box-upload --file receipt.jpg --dry-run
freee section-list
freee tag-list
freee segment-tag-list --segment 1
freee bs --fiscal-year 2025
freee pl --fiscal-year 2025
freee general-ledger --start-date 2025-01-01 --end-date 2025-12-31 \
  --account-item-name 売上高 --format json
freee journal-export --download-type generic_v2 --encoding utf-8 \
  --start-date 2025-01-01 --end-date 2025-12-31 --output journal-2025.csv
```

### 自動登録ルール

```bash
freee auto-rule-list --active active
freee auto-rule-create --act auto-standard --description AMAZON --condition partial \
  --entry-side expense --priority 5 --tax-name 課対仕入10% \
  --account-item-name 消耗品費 --qualified-invoice-setting qualified --dry-run
freee auto-rule-update --id 42 --account-item-name 通信費 --dry-run
freee auto-rule-update --id 42 --clear walletable --dry-run --format json
freee auto-rule-disable --id 42 --dry-run
freee wallet-txn-create --date 2026-08-01 --entry-side expense --amount 5000 \
  --walletable-id 55 --walletable-type credit_card --description AMAZON.CO.JP --dry-run
```

`auto-rule-update --clear <field>` は、JSON `null` を送って任意のルール条件を解除します。
複数の条件を一度に解除する場合は `--clear` を繰り返します。コマンドで指定していない項目は
現在の値を保持します。

### 請求書

```bash
freee invoice-list --sending-status unsent
freee invoice-create --partner-id 123 --billing-date 2026-08-01 \
  --line '{"description":"コンサルティング","quantity":1,"unit_price":"100000","tax_rate":10,"account_item_id":123,"tax_code":129}' --dry-run
freee invoice-update --id 456 --subject "8月分ご請求" --dry-run
```

### 人事労務

```bash
freee hr-employee-list --month 2026-08
freee hr-payroll-list --month 2026-08
```

## エージェントから使う

```bash
gh skill install Hiro5409/freee-cli freee-cli
```

## 開発

```bash
mise install
bun install --frozen-lockfile
bun run check
```

## ライセンス

MIT
