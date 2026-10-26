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

freee-cli therefore exposes small freee operations rather than application-specific workflows, with JSON output, structured errors, and focused `--dry-run` previews where they reveal more than the supplied arguments.

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
freee auth login --profile personal
freee profile list
freee company list
freee company switch --id 1234567 --name "My Company"
```

### Accounting

```bash
freee deal list --month 2026-08
freee deal create --date 2026-08-15 --type expense \
  --account-item-id 123 --tax-code 136 --amount 5000
freee wallet-txn list --month 2026-08 --status unreconciled
freee wallet-txn show --id 42
freee transfer list --month 2026-08
freee transfer create --date 2026-08-01 \
  --from-walletable-id 10 --from-walletable-type bank_account \
  --to '{"type":"credit_card","id":20,"amount":5000}'
freee file-box list --start-date 2026-08-01 --end-date 2026-08-31 --category without-deal
freee file-box upload --file receipt.jpg
freee section list
freee tag list
freee segment-tag list --segment 1
freee balance-sheet show --fiscal-year 2025
freee profit-and-loss show --fiscal-year 2025
freee general-ledger list --start-date 2025-01-01 --end-date 2025-12-31 \
  --account-item-name Sales --format json
freee journal export --download-type generic_v2 --encoding utf-8 \
  --start-date 2025-01-01 --end-date 2025-12-31 --output journal-2025.csv
```

### Auto-registration rules

```bash
freee auto-rule list --active active
freee auto-rule create --act auto-standard --description AMAZON --condition partial \
  --entry-side expense --priority 5 --tax-name 課対仕入10% \
  --account-item-name 消耗品費 --qualified-invoice-setting qualified --dry-run
freee auto-rule update --id 42 --account-item-name 通信費 --dry-run
freee auto-rule update --id 42 --clear walletable --dry-run --format json
freee auto-rule disable --id 42 --dry-run
freee wallet-txn create --date 2026-08-01 --entry-side expense --amount 5000 \
  --walletable-id 55 --walletable-type credit_card --description AMAZON.CO.JP
```

`auto-rule-update --clear <field>` removes an optional rule condition by sending JSON `null`.
Repeat `--clear` to remove multiple conditions in one full-state update; fields not named in the
command keep their current values.

### Invoices

```bash
freee invoice list --sending-status unsent
freee invoice create --partner-id 123 --billing-date 2026-08-01 \
  --line '{"description":"Consulting","quantity":1,"unit_price":"100000","tax_rate":10,"account_item_id":123,"tax_code":129}'
freee invoice update --id 456 --subject "August invoice" --dry-run
```

### Quotations

Quotations use the freee invoice API and their own document templates.

```bash
freee quotation list --month 2026-10 --format json
freee quotation show --id 456 --format json
freee quotation-template list --format json
freee quotation create --partner-id 123 --quotation-date 2026-10-01 \
  --expiration-date 2026-10-31 --subject "Development estimate" \
  --line '{"description":"Development","quantity":1,"unit_price":"100000","tax_rate":10}' --format json
```

Use either `--partner-id` or `--partner-code`. Repeat `--line` for multiple lines;
text lines accept only `type` and `description`. `--delivery-deadline` and
`--delivery-location` set delivery terms. Pass `--quotation-number` when the company
does not auto-number quotations. Creating a quotation saves the document without sending it.

### Human resources

```bash
freee hr employee list --month 2026-08
freee hr payroll list --month 2026-08
```

### Processing account statements

Statement processing uses the official Accounting API with API authentication. `register`, `settle`, and `transfer` accept the [official API request body](https://developer.freee.co.jp/reference/accounting) as `--body` JSON. The selected profile or `--company-id` supplies `company_id`, overriding that field in the body.

```bash
freee wallet-txn ignore --id 42
freee wallet-txn reset --id 42
freee wallet-txn register --id 42 --body '{"deal_lines":[{"account_item_id":101,"amount":10000,"description":"Cloud service"}]}'
freee wallet-txn register-private --id 42
freee wallet-txn settle --id 42 --body '{"deals":[{"deal_id":91,"amount":10000}]}'
freee wallet-txn transfer --id 42 --body '{"transfer_from_line":{"walletable_id":1,"walletable_type":"bank_account"},"transfer_to_lines":[{"walletable_id":7,"walletable_type":"wallet","amount":10000}]}'
freee wallet-txn apply-rules --id 42 --id 43 --format json
```

The CLI sends one request and returns the API result, without preflight reads, previews, dry-runs, or follow-up reads. freee validates accounting constraints and applies its defaults. `register` accepts all deal fields, `settle` supports multiple payments and an `adjustment_deal`, and `transfer` supports multiple destinations and `charge_lines`. `reset` returns a statement to unprocessed. `register-private` uses freee's company-specific private accounting treatment.

Rule application requires 1–1,000 statement IDs and runs asynchronously. freee skips ineligible statements, including processed ones; the CLI does not filter or reject them based on their state. A `queued` result confirms acceptance, not completion or a match; read the selected statements to inspect the outcome. Writes are never retried automatically. An `OUTCOME_UNKNOWN` error requires inspecting the affected statement before retrying.

### Browser-backed operations

Invoice registration, invoice sending-status changes, and account synchronization use [Agent Browser](https://github.com/vercel-labs/agent-browser). Run `freee auth login --web --profile <name>` to open a dedicated browser and select the configured company. The CLI waits up to five minutes and saves only a verified, encrypted session. `freee auth status --profile <name> --format json` reports API and browser access separately.

```bash
freee invoice register-deal --id 456
freee invoice set-sending-status --id 456 --status sent
freee walletable sync --id 42
freee walletable sync --all
```

Account synchronization waits up to one hour. Table output reports progress on stderr; JSON output keeps stdout machine-readable. With `--all`, freee selects eligible wallets and the result identifies those whose synchronization started and completed.

These operations depend on observed Web interfaces. See the [Web operations module](src/plugins/web-operations/README.md) for their scope. Authentication state belongs to freee-cli and remains outside the repository.

Bun applications can resolve a connection profile and use the remaining Web operations directly:

```ts
import { withFreeeWeb } from "freee-cli/experimental/web";
import { resolveFreeeScope } from "freee-cli/profiles";

const scope = resolveFreeeScope("business");
await withFreeeWeb(scope, async (web) => {
  console.log(await web.walletableSummary());
});
```

## Calling from Agents

```bash
gh skill install Hiro5409/freee-cli freee-cli
```

## Development

Install and [activate mise](https://mise.jdx.dev/getting-started.html). `mise.toml` pins Bun, Node.js, GitHub CLI, Gitleaks, and Lefthook and puts the locally installed Vite+ commands on `PATH`:

```bash
mise trust
mise install
bun install --frozen-lockfile
lefthook install
bun run check
```

[Lefthook](https://lefthook.dev/) runs the Git hooks defined in `lefthook.yml`. The pre-commit hook formats, lints, and type-checks staged files, then scans them for secrets with Gitleaks. The pre-push hook runs `bun audit --audit-level=high`, the same audit that CI runs. The post-checkout hook installs dependencies from the lockfile when `node_modules` is missing. CI runs the full `bun run check` and scans Git history with the same Gitleaks version.

## Releases

A maintainer releases from `main`: commit the new `version` in `package.json`, push the commit to `main`, then push the annotated tag for that version:

```bash
git tag -a v1.2.3 --cleanup=verbatim -F - <<'NOTES'
## Changes

- Describe a change a user will notice.
NOTES
git push origin v1.2.3
```

The tag message lists, as Markdown, the changes a user will notice, and becomes the GitHub Release notes. Git reads it from standard input, and `--cleanup=verbatim` keeps lines that start with `#`, such as headings, which Git otherwise strips as comments.

The tag starts the Release workflow. The workflow verifies that the tag is annotated, matches `package.json`, and belongs to `main`, then runs CI on the tagged commit. CI packs the npm artifact once and smoke-tests that tarball, and both publishing jobs download the tested artifact instead of building it again.

The first job publishes the artifact to npm through trusted publishing, with provenance. npm [scans a new version](https://github.blog/changelog/2026-07-28-npm-publish-time-malware-scanning-and-dual-use-metadata/) before serving it, so the second job waits up to 30 minutes for the version to become visible. It creates the GitHub Release only when the version published on npm has the integrity of the tested artifact. It attaches the artifact while the release is still a draft and then publishes it, because an immutable release locks its assets once it is published.

Release configuration includes these settings outside the repository:

- An npm [trusted publisher](https://docs.npmjs.com/trusted-publishers/) for user `Hiro5409`, repository `freee-cli`, and workflow filename `release.yml`, with no environment.
- [Immutable releases](https://docs.github.com/en/code-security/concepts/supply-chain-security/immutable-releases) for the repository, so that the tag and the attached artifact of a published GitHub Release cannot change.
- An active tag ruleset for `v*` that restricts updates and deletions, allows creation, and has no bypass actors. Tags are protected from the moment they are pushed, including while CI and npm publication are in progress.

To retry a transient failure, run the workflow again from its tag:

```bash
gh workflow run release.yml --ref v1.2.3
```

This run packs and tests the tagged commit again; packing is reproducible, so it tests the artifact an earlier run published. Every run acts on what it finds: it publishes the artifact while the version is not visible on npm, and creates the GitHub Release while no published release exists for the tag. A published release that carries the tested artifact is complete, and the run leaves it as it is. A run started from a branch stops at tag verification; the workflow never changes `main`, the version, or tags.

A retry uses the code and workflow at the same tag. To correct the tagged commit, tag metadata, or workflow, fix `main` and release a new version with a new annotated tag. Existing release tags are not moved or reused.

A run stops when it cannot read npm or GitHub, when the published version differs from the tested artifact, and when a published release lacks the tested artifact or carries one with a different digest. The workflow does not repair such a release.

A run fails when npm does not serve the version within 30 minutes. Run the workflow again once the version is visible on npm; a run that starts earlier attempts to publish the version again.

GitHub CLI attempts to delete its draft when attaching the artifact or publishing the release fails. A failed cleanup or an interrupted run can leave a draft release behind; the workflow does not look for drafts, so a maintainer deletes it.

## License

MIT
