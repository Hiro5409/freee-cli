<h1 align="center">freee-cli</h1>

<p align="center">
  An unofficial CLI for the <a href="https://developer.freee.co.jp/">freee API</a>.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/freee-cli"><img src="https://img.shields.io/npm/v/freee-cli" alt="npm version"></a>
  <a href="https://github.com/Hiro5409/freee-cli/actions/workflows/ci.yml"><img src="https://github.com/Hiro5409/freee-cli/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="./LICENSE"><img src="https://img.shields.io/github/license/Hiro5409/freee-cli" alt="License: MIT"></a>
</p>

## Why a CLI?

freee already provides an [official MCP server](https://github.com/freee/freee-mcp).
freee-cli exists because we believe a CLI is the better interface for coding agents that already have shell access.

A CLI gives agents the same interface used by developers, scripts, and CI.
Commands can be discovered with `--help`, composed with files and pipes, and run directly when debugging.

freee-cli therefore exposes small freee operations rather than application-specific workflows: every result is compact JSON on stdout, every error is one line of JSON on stderr, and every API command accepts `--dry-run`. `auth login` also writes its authorization URL to stderr as a JSON line.

## Generated from official schemas

Every operation in freee's [OpenAPI schemas](https://github.com/freee/freee-api-schema) for the Accounting, Invoice, and HR APIs is a command named `freee <api> <resource> <action>`.

```bash
freee accounting deal list --start-issue-date 2026-08-01 --end-issue-date 2026-08-31 --all
freee accounting manual-journal create --body '{"issue_date":"2026-08-01","details":[{"entry_side":"debit","account_item_id":101,"tax_code":0,"amount":1000},{"entry_side":"credit","account_item_id":102,"tax_code":0,"amount":1000}]}'
freee invoice quotation cancel --id 7
freee hr employee bank-account-rule show --employee-id 3 --year 2026 --month 8
```

Path and query parameters are flags, and a request body is one `--body` JSON object, given inline, as `@<path>` to a file, or as `-` for standard input. Integers must lie within ±(2^53 - 1). `freee schema <api> <resource> <action>` prints the JSON Schema of the request, and every request is validated against it before it is sent. The selected profile or `--company-id` supplies `company_id`, overriding that field in the body.

`--dry-run` prints the request without sending it. `--all` reads every page of a list. A download writes to `--output <path>`, which must not exist yet. Writes are never retried automatically, but reads are, including `accounting journal list`, which requests a journal export; an `OUTCOME_UNKNOWN` error requires reading the affected resource before retrying. An update replaces the whole resource, as the API does, so build its body from a fresh read.

A journal export is three commands: `accounting journal list` requests it, `accounting journal report status show` reports when it is ready, and `accounting journal report download --output <path>` saves it.

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
freee schema accounting deal create
```

### Authentication

```bash
freee auth login --profile personal
freee profile list
freee accounting company list
freee company switch --id 1234567 --name "My Company"
```

## Calling from Agents

```bash
gh skill install Hiro5409/freee-cli freee-cli
```

## Development

Install and [activate mise](https://mise.jdx.dev/getting-started.html), then:

```bash
mise trust
mise install
bun ci
lefthook install
bun run check
```

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

Release configuration includes these settings outside the repository:

- An npm [trusted publisher](https://docs.npmjs.com/trusted-publishers/) for user `Hiro5409`, repository `freee-cli`, and workflow filename `release.yml`, with no environment.
- [Immutable releases](https://docs.github.com/en/code-security/concepts/supply-chain-security/immutable-releases) for the repository, so that the tag and the attached artifact of a published GitHub Release cannot change.
- An active tag ruleset for `v*` that restricts updates and deletions, allows creation, and has no bypass actors. Tags are protected from the moment they are pushed, including while CI and npm publication are in progress.

To retry a failed run, run the workflow again from its tag. It publishes and releases only what is still missing. Release tags are never moved; to change a released commit, release a new version.

```bash
gh workflow run release.yml --ref v1.2.3
```

## License

MIT
