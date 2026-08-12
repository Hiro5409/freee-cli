#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

gh api "repos/freee/freee-api-schema/contents/v2020_06_15/open-api-3/api-schema.json" \
  -H "Accept: application/vnd.github.raw" > api-schema.baseline.json
gh api "repos/freee/freee-api-schema/contents/iv/open-api-3/api-schema.yml" \
  -H "Accept: application/vnd.github.raw" > api-schema.iv.baseline.yml
gh api "repos/freee/freee-api-schema/contents/hr/open-api-3/api-schema.json" \
  -H "Accept: application/vnd.github.raw" > api-schema.hr.baseline.json

echo "Updated accounting, invoice, and HR API schema baselines."
