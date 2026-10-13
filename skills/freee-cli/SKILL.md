---
name: freee-cli
description: Use freee-cli for accounting, invoices, HR, and experimental freee Web operations.
license: MIT
compatibility: Requires the freee command and an interactive user for setup or OAuth login. Web operations also require Agent Browser.
metadata:
  source: https://github.com/Hiro5409/freee-cli
---

# freee-cli

Discover supported commands with `freee --help` and unfamiliar arguments with the selected command's `--help`. Upstream API schemas and generated clients cover more than the CLI exposes. Use `--format json` for machine-readable results.

Before a write batch, resolve one profile and company and verify referenced IDs and side-effect-bearing values with reads. Keep that target fixed through execution and verification. For `freee web`, verify the profile's configured company with `freee profile-list --format json`; Web commands have no company override. File Box uploads use only files explicitly selected by the user.

Use an available `--dry-run --format json` when current state or the affected set can change the decision: destructive operations, replacement or fetch-merge writes, and multi-target writes. A preview is unnecessary when all effects are already determined by the supplied fields. It does not prove write permission or replace approval.

Present the complete batch and intended final state, then wait for explicit user approval. Approval covers the unchanged batch, including dependent writes whose IDs are created by earlier steps. Ask again only if current state or a preview changes the approved target, scope, or intended final state.

Verify the requested state from the structured result or a follow-up read. If a write's outcome is uncertain, inspect the affected resource before retrying: it may already have completed.
