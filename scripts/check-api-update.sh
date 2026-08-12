#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ACCOUNTING_SPEC_URL="https://raw.githubusercontent.com/freee/freee-api-schema/master/v2020_06_15/open-api-3/api-schema.json"
INVOICE_SPEC_URL="https://raw.githubusercontent.com/freee/freee-api-schema/master/iv/open-api-3/api-schema.yml"
HR_SPEC_URL="https://raw.githubusercontent.com/freee/freee-api-schema/master/hr/open-api-3/api-schema.json"
SCHEMA_CHANGED=0

cd "$ROOT"

if ! command -v oasdiff >/dev/null 2>&1; then
  echo "oasdiff is required for API schema checks." >&2
  echo "Install it with: go install github.com/oasdiff/oasdiff@v1.18.1" >&2
  echo "Or on macOS: brew install oasdiff" >&2
  exit 127
fi
if ! oasdiff --help >/dev/null 2>&1; then
  echo "oasdiff is installed but cannot run in the current environment." >&2
  echo "Activate the Go runtime used to install it, or reinstall it with Homebrew." >&2
  exit 127
fi

check_schema() {
  local name="$1"
  local baseline="$2"
  local spec_url="$3"

  echo "=== Checking ${name} API schema ==="
  if [ ! -f "$baseline" ]; then
    echo "Missing baseline: $baseline" >&2
    echo "Run 'bun run check-api-update:apply' to create it." >&2
    exit 1
  fi

  local breaking_exit=0
  oasdiff breaking "$baseline" "$spec_url" --fail-on ERR 2>&1 || breaking_exit=$?
  if [ "$breaking_exit" -ne 0 ]; then
    echo ""
    echo "Breaking changes detected in the ${name} API schema." >&2
    echo ""
    echo "Full diff:"
    oasdiff diff "$baseline" "$spec_url" -f text 2>&1 | sed -n '1,100p'
    echo ""
    echo "Review the changes, then run 'bun run check-api-update:apply' to accept them."
    exit 1
  fi

  local diff_output
  diff_output=$(oasdiff diff "$baseline" "$spec_url" -f text 2>&1)
  if [ -z "$diff_output" ] || [ "$diff_output" = "No changes" ] || [ "$diff_output" = "No changes detected" ]; then
    echo "No changes."
    return
  fi

  echo "Non-breaking changes detected."
  SCHEMA_CHANGED=1
}

check_schema "accounting" "api-schema.baseline.json" "$ACCOUNTING_SPEC_URL"
check_schema "invoice" "api-schema.iv.baseline.yml" "$INVOICE_SPEC_URL"
check_schema "HR" "api-schema.hr.baseline.json" "$HR_SPEC_URL"

if [ "$SCHEMA_CHANGED" -eq 0 ]; then
  echo "All tracked API schemas are unchanged."
  exit 0
fi

echo "=== Regenerating clients ==="
bun run generate-types 2>&1

echo "=== Type checking ==="
bunx tsc --noEmit 2>&1

echo "Schema changes are compatible with the generated clients."
echo "Run 'bun run check-api-update:apply' to update the baselines."
