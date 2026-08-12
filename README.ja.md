<h1 align="center">freee-cli</h1>

<p align="center">
  <a href="https://developer.freee.co.jp/">freee API</a> の非公式 CLI。
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/freee-cli"><img src="https://img.shields.io/npm/v/freee-cli" alt="npm version"></a>
  <a href="https://github.com/Hiro5409/freee-cli/actions/workflows/ci.yml"><img src="https://github.com/Hiro5409/freee-cli/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="./LICENSE"><img src="https://img.shields.io/badge/License-MIT-blue.svg" alt="License: MIT"></a>
</p>

<p align="center">
  <a href="README.md">English</a> | 日本語
</p>

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
freee wallet-txn-list --month 2026-08
freee receipt-upload --file receipt.jpg --dry-run
freee bs --fiscal-year 2025
freee pl --fiscal-year 2025
```

### 自動登録ルール

```bash
freee auto-rule-list --active active
freee auto-rule-create --description AMAZON --condition partial --entry-side expense \
  --priority 5 --tax-name 課対仕入10% --account-item-name 消耗品費 --dry-run
freee auto-rule-disable --id 42 --dry-run
freee auto-rule-apply --date 2026-08-01 --entry-side expense --amount 5000 \
  --wallet-id 55 --wallet-type credit_card --description AMAZON.CO.JP --dry-run
```

### 請求書

```bash
freee invoice-list --sending-status unsent
freee invoice-create --partner-id 123 --billing-date 2026-08-01 \
  --line '{"description":"コンサルティング","quantity":1,"unit_price":"100000","tax_rate":10}' --dry-run
freee invoice-update --id 456 --subject "8月分ご請求" --dry-run
```

### 人事労務

```bash
freee hr-employee-list --month 2026-08
freee hr-payroll-list --month 2026-08
```

### ワークフロー

```bash
freee how-booked --keyword ヨドバシ --year 2025
freee receipt-attach --deal-id 12345 --file receipt.jpg --dry-run
```

## エージェントから使う

```bash
npx skills add Hiro5409/freee-cli --skill freee-cli
freee docs list --format json
freee deal-list --month 2026-08 --format json

freee deal-create --date 2026-08-15 --type expense \
  --account-item-id 123 --tax-code 136 --amount 5000 \
  --dry-run --format json
```

## 開発

```bash
bun install --frozen-lockfile
bun run check
bun test
```

## ライセンス

MIT
