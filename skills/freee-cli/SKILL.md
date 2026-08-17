---
name: freee-cli
description: Use when working with freee through freee-cli, including accounting, invoices, payroll, File Box, wallet transactions, and auto-registration rules.
license: MIT
compatibility: Requires the freee command and an interactive user for setup or OAuth login.
metadata:
  source: https://github.com/Hiro5409/freee-cli
---

# freee-cli

Probe with `command -v freee && freee --version`.
If unavailable, ask the user to install freee-cli.

1. Run `freee --help` to discover commands.
2. Run the selected command with `--help` before constructing unfamiliar arguments.
3. Use `--format json` for data consumed by an agent or another command.
4. For `setup` or `login`, ask the user to run the command in an interactive terminal.
5. Before a freee API write, use read commands to verify the selected profile, company, and referenced IDs.
   For File Box uploads, use only the file path the user explicitly selected.
6. Run the complete write with `--dry-run --format json` and inspect the exact write request. A dry-run never sends the write. Fetch-merge commands may read current freee data, so a successful preview can verify read access but not write permission.
7. Present the preview and wait for explicit user approval. After approval, run the same command with only `--dry-run` removed.
8. For a state-changing command without `--dry-run`, present the exact command and side effect and wait for approval.

Treat accounting, invoice, and HR resources as separate APIs even when names overlap.
Keep the same `--profile` and `--company-id` across reads, preview, write, and verification.
Stop on authentication, access, or identifier errors and follow the error's `Hint`.

Complete a read when the command exits successfully and returns parseable JSON.
Complete a download or export when the command succeeds and the requested file exists.
Complete a mutation when the write succeeds and a follow-up read confirms the requested state.
