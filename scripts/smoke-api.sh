#!/usr/bin/env bash
set -euo pipefail

API_BASE_URL="${API_BASE_URL:-http://localhost:8080}"
ADMIN_DEMO_TOKEN="${ADMIN_DEMO_TOKEN:-local-admin-demo-token}"

printf 'Checking API health at %s\n' "$API_BASE_URL"
curl -fsS "$API_BASE_URL/health" >/tmp/crownfi-health.json
cat /tmp/crownfi-health.json
printf '\n'

printf 'Submitting first vote...\n'
curl -fsS -X POST "$API_BASE_URL/events/coronation-night-2026/vote" \
  -H 'content-type: application/json' \
  -d '{"category_id":"fan-choice","voter_id":"smoke-voter-1","contestant_id":"phl"}' \
  >/tmp/crownfi-vote.json
cat /tmp/crownfi-vote.json
printf '\n'

printf 'Checking duplicate vote rejection...\n'
set +e
DUPLICATE_STATUS=$(curl -sS -o /tmp/crownfi-duplicate.json -w '%{http_code}' \
  -X POST "$API_BASE_URL/events/coronation-night-2026/vote" \
  -H 'content-type: application/json' \
  -d '{"category_id":"fan-choice","voter_id":"smoke-voter-1","contestant_id":"phl"}')
set -e
cat /tmp/crownfi-duplicate.json
printf '\n'
if [ "$DUPLICATE_STATUS" != "409" ]; then
  echo "Expected duplicate vote to return HTTP 409, got $DUPLICATE_STATUS" >&2
  exit 1
fi

printf 'Creating snapshot...\n'
curl -fsS -X POST "$API_BASE_URL/admin/events/coronation-night-2026/snapshot" \
  -H 'content-type: application/json' \
  -H "x-admin-demo-token: $ADMIN_DEMO_TOKEN" \
  -d '{"category_id":"fan-choice"}' \
  >/tmp/crownfi-snapshot.json
cat /tmp/crownfi-snapshot.json
printf '\n'

SNAPSHOT_ID=$(python3 - <<'PY'
import json
with open('/tmp/crownfi-snapshot.json', 'r', encoding='utf-8') as fh:
    print(json.load(fh)['id'])
PY
)

printf 'Anchoring snapshot %s...\n' "$SNAPSHOT_ID"
curl -fsS -X POST "$API_BASE_URL/admin/snapshots/$SNAPSHOT_ID/anchor" \
  -H "x-admin-demo-token: $ADMIN_DEMO_TOKEN" \
  >/tmp/crownfi-anchor.json
cat /tmp/crownfi-anchor.json
printf '\n'

printf 'Verifying snapshot %s...\n' "$SNAPSHOT_ID"
curl -fsS "$API_BASE_URL/snapshots/$SNAPSHOT_ID/verify" >/tmp/crownfi-verify.json
cat /tmp/crownfi-verify.json
printf '\nSmoke test passed.\n'
