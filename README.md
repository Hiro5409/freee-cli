<h1 align="center">freee-cli</h1>

<p align="center">
  An unofficial CLI for the <a href="https://developer.freee.co.jp/">freee API</a>.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/freee-cli"><img src="https://img.shields.io/npm/v/freee-cli" alt="npm version"></a>
  <a href="https://github.com/Hiro5409/freee-cli/actions/workflows/ci.yml"><img src="https://github.com/Hiro5409/freee-cli/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="./LICENSE"><img src="https://img.shields.io/github/license/Hiro5409/freee-cli" alt="License: MIT"></a>
</p>

<p align="center">
  English | <a href="README.ja.md">日本語</a>
</p>

## Why a CLI?

freee already provides an [official MCP server](https://github.com/freee/freee-mcp).
freee-cli exists because we believe a CLI is the better interface for coding agents that already have shell access.

A CLI gives agents the same interface used by developers, scripts, and CI.
Commands can be discovered with `--help`, composed with files and pipes, and run directly when debugging.

freee-cli therefore exposes small freee operations rather than application-specific workflows, with JSON output, structured errors, and `--dry-run` for mutations.

## Generated from official schemas

API clients are generated from freee's maintained [OpenAPI schemas](https://github.com/freee/freee-api-schema).

## Quick Start

```bash
bunx freee-cli setup
```

## Installation

```bash
bun add -g freee-cli
```

## Usage

```bash
freee --help
freee <command> --help
```

### Authentication

```bash
freee login --profile personal
freee profile-list
freee company-list
freee company-switch --id 1234567 --name "My Company"
```

### Accounting

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
  --account-item-name Sales --format json
freee journal-export --download-type generic_v2 --encoding utf-8 \
  --start-date 2025-01-01 --end-date 2025-12-31 --output journal-2025.csv
```

### Auto-registration rules

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

`auto-rule-update --clear <field>` removes an optional rule condition by sending JSON `null`.
Repeat `--clear` to remove multiple conditions in one full-state update; fields not named in the
command keep their current values.

### Invoices

```bash
freee invoice-list --sending-status unsent
freee invoice-create --partner-id 123 --billing-date 2026-08-01 \
  --line '{"description":"Consulting","quantity":1,"unit_price":"100000","tax_rate":10,"account_item_id":123,"tax_code":129}' --dry-run
freee invoice-update --id 456 --subject "August invoice" --dry-run
```

### Human resources

```bash
freee hr-employee-list --month 2026-08
freee hr-payroll-list --month 2026-08
```

### Experimental freee Web operations

`freee setup` can enable Web-only operations for an OAuth profile. They require [Agent Browser](https://github.com/vercel-labs/agent-browser) and a separate Agent Browser Auth Profile. freee-cli stores only the Auth Profile name; Agent Browser owns the login and saved session.

Before the first Web operation, set `AGENT_BROWSER_ENCRYPTION_KEY` to 64 hexadecimal characters or store the key in `~/.agent-browser/.encryption-key`.

```bash
freee walletable-list
freee web walletable-sync --all --dry-run
freee web walletable-sync --id 42
freee web walletable-sync --all
```

Use `freee walletable-list` to obtain the walletable ID from the official API. The Web command starts synchronization and waits for completion for up to one hour. Table output reports state changes to stderr; JSON output suppresses that progress so stdout remains machine-readable.

`--dry-run` lists the walletables that freee-cli would include in the request without starting synchronization. It does not guarantee that freee will accept or complete the request.

With `--all`, freee selects the eligible walletables that participate. The result includes only walletables whose synchronization started and completed; use `--id` when a candidate was not selected.

These commands use observed, unsupported freee Web interfaces. They fail when an observed response no longer matches the expected shape and are excluded from the stability expectations of commands generated from official OpenAPI schemas.

Bun applications can use the experimental bookkeeping and invoice-registration adapter directly:

```ts
import { withFreeeBrowser } from "freee-cli/experimental/web";
```

The caller owns operation sequencing and supplies the company ID and Auth Profile. Preview methods do not write; registration, settlement, transfer, ignore, invoice-registration, and auto-rule methods write immediately and have no generic dry-run. If an `OutcomeUnknownError` is returned, inspect the affected resource in freee before retrying because the write may already have completed.

## Calling from Agents

```bash
gh skill install Hiro5409/freee-cli freee-cli
```

## Development

```bash
mise install
bun install --frozen-lockfile
bun run check
```

## License

MIT
