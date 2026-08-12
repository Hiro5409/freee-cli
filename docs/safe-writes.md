---
description: Preview mutations and preserve full-resource update semantics.
---

# Safe writes

Every mutating command supports `--dry-run`.
Preview the exact request before running the same command without `--dry-run`.
Dry-run validates the local payload but does not verify credentials, company access, or referenced IDs with freee.

```sh
freee deal-create --company-id 123 --date 2026-08-01 --type expense \
  --account-item-id 101 --tax-code 21 --amount 5000 \
  --dry-run --format json
```

Update commands use fetch-merge-PUT when freee requires full-resource replacement.
They fetch the current resource, preserve unspecified mutable fields, and send the complete update.

Unknown options fail before command execution, so a misspelled `--dry-run` cannot silently become a write.
