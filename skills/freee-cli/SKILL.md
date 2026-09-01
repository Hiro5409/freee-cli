---
name: freee-cli
description: Use when working with freee through freee-cli, including accounting, invoices, payroll, File Box, wallet transactions, and auto-registration rules.
license: MIT
compatibility: Requires the freee command and an interactive user for setup or OAuth login. Web operations also require Agent Browser.
metadata:
  source: https://github.com/Hiro5409/freee-cli
---

# freee-cli

Probe with `command -v freee && freee --version`.
If unavailable, ask the user to install freee-cli.

1. Run `freee --help` to discover commands.
   Treat it as the supported command surface; do not infer CLI coverage from the upstream OpenAPI schema or generated clients.
2. Run the selected command with `--help` before constructing unfamiliar arguments.
3. Use `--format json` for data consumed by an agent or another command.
4. For `setup` or `login`, ask the user to run the command in an interactive terminal.
5. Before a cohesive freee write batch, resolve one profile and company and use read commands to verify referenced IDs and every value that determines the intended side effects.
   `freee web` accepts no `--company-id`; verify its profile's configured company with `freee profile-list --format json` before the batch.
   For File Box uploads, use only the file path the user explicitly selected.
6. Treat `--dry-run` as a verification tool, not an approval boundary. When the selected command provides it, use `--dry-run --format json` if its preview can expose a decision-bearing difference: destructive operations, replacement or fetch-merge writes, and multi-target or fan-out writes. A simple create or update whose complete fields are already fixed in the plan does not require a dry-run. A dry-run never sends the write or proves write permission.
7. Present the complete batch and intended final state, then wait for explicit user approval. One approval covers the unchanged batch, including dependent writes whose IDs are created by earlier steps.
8. After approval, execute and verify the batch with the same resolved profile and company. Continue through later reads or previews when they confirm the approved batch; request another approval only when current state or a preview changes the approved target, scope, or intended final state.

Treat accounting, invoice, and HR resources as separate APIs even when names overlap.
Follow every structured error's `hint` before deciding whether to retry or stop.

Complete a read when the command exits successfully and returns parseable JSON.
Complete a download or export when the command succeeds and the requested file exists.
Complete a mutation when its structured result reports the requested state. Otherwise, confirm it with a follow-up read.
