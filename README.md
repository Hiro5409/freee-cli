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
freee wallet-txn-list --month 2026-08
freee file-box-upload --file receipt.jpg --dry-run
freee bs --fiscal-year 2025
freee pl --fiscal-year 2025
freee journal-export --download-type generic_v2 --encoding utf-8 \
  --start-date 2025-01-01 --end-date 2025-12-31 --output journal-2025.csv
```

### Auto-registration rules

```bash
freee auto-rule-list --active active
freee auto-rule-create-deal --description AMAZON --condition partial --entry-side expense \
  --priority 5 --tax-name 課対仕入10% --account-item-name 消耗品費 --dry-run
freee auto-rule-disable --id 42 --dry-run
freee wallet-txn-create --date 2026-08-01 --entry-side expense --amount 5000 \
  --walletable-id 55 --walletable-type credit_card --description AMAZON.CO.JP --dry-run
```

### Invoices

```bash
freee invoice-list --sending-status unsent
freee invoice-create --partner-id 123 --billing-date 2026-08-01 \
  --line '{"description":"Consulting","quantity":1,"unit_price":"100000","tax_rate":10}' --dry-run
freee invoice-update --id 456 --subject "August invoice" --dry-run
```

### Human resources

```bash
freee hr-employee-list --month 2026-08
freee hr-payroll-list --month 2026-08
```

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
