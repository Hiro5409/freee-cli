---
name: freee-cli
description: Use freee-cli to inspect or change freee accounting, invoice, payroll, company, receipt, wallet, and auto-registration data. Trigger for tasks executed through the freee command.
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
5. Before a mutation, use read commands to verify the selected profile, company, and referenced IDs.
   For receipt uploads, use only the file path the user explicitly selected.
6. Run the complete mutation with `--dry-run --format json` and inspect the local request preview. A successful preview does not verify credentials, access, or referenced IDs with freee.
7. Present the preview and wait for explicit user approval. After approval, run the same command with only `--dry-run` removed.

Treat accounting, invoice, and HR resources as separate APIs even when names overlap.
Keep the same `--profile` and `--company-id` across reads, preview, write, and verification.
Stop on authentication, access, or identifier errors and follow the error's `Hint`.

Complete a read when it returns parseable JSON.
Complete a mutation when the write succeeds and a follow-up read confirms the requested state.
