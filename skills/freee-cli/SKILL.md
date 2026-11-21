---
name: freee-cli
description: Use freee-cli for accounting, invoices, and HR.
license: MIT
compatibility: Requires the freee command and an interactive user for setup or OAuth login.
metadata:
  source: https://github.com/Hiro5409/freee-cli
---

# freee-cli

Every freee Accounting, Invoice, and HR API operation is a command named `freee <api> <resource> <action>`. Discover commands with `--help`, and read a request body's shape with `freee schema <api> <resource> <action>` before composing `--body`. Results are compact JSON on stdout, and errors are one line of JSON on stderr.

Before a write batch, resolve one profile and company and verify referenced IDs and side-effect-bearing values with reads. An update replaces the whole resource, so build its body from a fresh read. HR results include personal data such as pension numbers; select only the fields the task needs, for example with `jq`. Keep that target fixed through execution and verification. File uploads use only files explicitly selected by the user.

Execute reversible operations directly after approval. Use a preview only when it can resolve an open question about the target, scope, or accounting treatment. A preview does not prove write permission or replace approval.

Present the complete batch and intended final state, then wait for explicit user approval. Approval covers the unchanged batch, including dependent writes whose IDs are created by earlier steps. Ask again only if current state or a preview changes the approved target, scope, or intended final state.

Verify the requested state from the structured result or a follow-up read. If a write's outcome is uncertain, inspect the affected resource before retrying: it may already have completed.
