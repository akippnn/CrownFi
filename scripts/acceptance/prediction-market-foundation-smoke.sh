#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$repo_root"

env_file="${CROWNFI_MARKETS_SMOKE_ENV_FILE:-infra/.env.prediction-market-smoke}"
evidence_dir="${CROWNFI_MARKETS_EVIDENCE_DIR:-.artifacts/acceptance/prediction-market-foundation}"
timeout_seconds="${CROWNFI_MARKETS_TIMEOUT_SECONDS:-1200}"
admin_token="${CROWNFI_MARKETS_ADMIN_TOKEN:-local-admin-demo-token}"
web_token="${CROWNFI_MARKETS_WEB_TOKEN:-local-web-to-api-token-change-before-sharing}"
project_name="${CROWNFI_MARKETS_PROJECT:-crownfi-markets-${GITHUB_RUN_ID:-local}}"
wallet_address="GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF"

for command in docker curl python3 date; do
  command -v "$command" >/dev/null 2>&1 || {
    echo "Required command not found: $command" >&2
    exit 1
  }
done
docker compose version >/dev/null

if [[ ! -f "$env_file" ]]; then
  cp infra/.env.example "$env_file"
fi
mkdir -p "$evidence_dir"
compose=(docker compose --project-name "$project_name" --env-file "$env_file" -f infra/docker-compose.yml)

cleanup() {
  local status=$?
  if [[ $status -ne 0 ]]; then
    "${compose[@]}" ps --all | tee "$evidence_dir/failure-compose-ps.txt" || true
    "${compose[@]}" logs --no-color --tail=500 | tee "$evidence_dir/failure-compose-logs.txt" || true
  fi
  "${compose[@]}" down --volumes --remove-orphans || true
  exit "$status"
}
trap cleanup EXIT

wait_for_url() {
  local url=$1
  local started_at
  started_at=$(date +%s)
  until curl --fail --silent --show-error "$url" >/dev/null; do
    if (( $(date +%s) - started_at >= timeout_seconds )); then
      echo "Timed out waiting for $url" >&2
      return 1
    fi
    sleep 3
  done
}

json_field() {
  local file=$1
  local expression=$2
  python3 - "$file" "$expression" <<'PY'
import json
import sys

path, expression = sys.argv[1:]
with open(path, encoding="utf-8") as handle:
    value = json.load(handle)
for part in expression.split("."):
    value = value[int(part)] if isinstance(value, list) else value[part]
print(value)
PY
}

admin_post() {
  local url=$1
  local output=$2
  local actor_id=$3
  local body=$4
  curl --fail --silent --show-error \
    --request POST "$url" \
    --header 'content-type: application/json' \
    --header "x-crownfi-web-token: $web_token" \
    --header "x-crownfi-user-id: $actor_id" \
    --data "$body" >"$output"
}

server_get() {
  local url=$1
  local output=$2
  local actor_id=$3
  curl --fail --silent --show-error \
    --header "x-crownfi-web-token: $web_token" \
    --header "x-crownfi-user-id: $actor_id" \
    "$url" >"$output"
}

"${compose[@]}" up --build --detach postgres redis db-init api
wait_for_url "http://127.0.0.1:8080/ready"

curl --fail --silent --show-error \
  --request POST "http://127.0.0.1:8080/admin/platform/bootstrap" \
  --header 'content-type: application/json' \
  --header "x-admin-demo-token: $admin_token" \
  --data '{"display_name":"Market Owner","email":"market-owner@example.test","organization_name":"Market Smoke Organization","organization_slug":"market-smoke"}' \
  >"$evidence_dir/bootstrap-owner.json"
owner_id=$(json_field "$evidence_dir/bootstrap-owner.json" user.id)
organization_id=$(json_field "$evidence_dir/bootstrap-owner.json" organization.id)

curl --fail --silent --show-error \
  --request POST "http://127.0.0.1:8080/admin/platform/bootstrap" \
  --header 'content-type: application/json' \
  --header "x-admin-demo-token: $admin_token" \
  --data '{"display_name":"Other Tenant","email":"other-tenant@example.test","organization_name":"Other Tenant Organization","organization_slug":"other-tenant"}' \
  >"$evidence_dir/bootstrap-other.json"
other_user_id=$(json_field "$evidence_dir/bootstrap-other.json" user.id)

stellar_account_id=$(python3 - <<'PY'
import uuid
print(uuid.uuid4())
PY
)
"${compose[@]}" exec -T postgres psql \
  -U "${POSTGRES_USER:-crownfi}" \
  -d "${POSTGRES_DB:-crownfi}" \
  -v ON_ERROR_STOP=1 \
  -c "INSERT INTO site_administrators (user_id, role, status) VALUES ('$owner_id','owner','active'); INSERT INTO stellar_accounts (id,user_id,network,address,is_primary,verified_at) VALUES ('$stellar_account_id','$owner_id','testnet','$wallet_address',true,now());" \
  >"$evidence_dir/identity-fixture.txt"

opens_at=$(date -u -d '1 minute ago' +%Y-%m-%dT%H:%M:%SZ)
closes_at=$(date -u -d '1 hour' +%Y-%m-%dT%H:%M:%SZ)
market_body=$(python3 - "$organization_id" "$opens_at" "$closes_at" <<'PY'
import json
import sys

organization_id, opens_at, closes_at = sys.argv[1:]
print(json.dumps({
    "organization_id": organization_id,
    "slug": "fan-choice-head-to-head",
    "question": "Will the Philippines contestant win the Fan Choice head-to-head?",
    "description": "A tiny Testnet-only market used to verify policy, lifecycle, and intent persistence.",
    "asset_code": "XLM",
    "asset_scale": 7,
    "fee_bps": 100,
    "min_stake_minor": 1000,
    "max_stake_minor": 5000,
    "max_user_exposure_minor": 6000,
    "max_market_exposure_minor": 20000,
    "opens_at": opens_at,
    "closes_at": closes_at,
    "resolution_source": "Reviewed and recorded official Fan Choice result evidence.",
    "policy_version": "hackathon-testnet-v1",
    "outcomes": [
        {"code": "YES", "label": "Yes"},
        {"code": "NO", "label": "No"}
    ]
}))
PY
)

cross_tenant_status=$(curl --silent --show-error \
  --output "$evidence_dir/cross-tenant-create.json" \
  --write-out '%{http_code}' \
  --request POST "http://127.0.0.1:8080/internal/markets" \
  --header 'content-type: application/json' \
  --header "x-crownfi-web-token: $web_token" \
  --header "x-crownfi-user-id: $other_user_id" \
  --data "$market_body")
if [[ "$cross_tenant_status" != "404" ]]; then
  echo "Expected cross-tenant market creation to be concealed with 404, got $cross_tenant_status" >&2
  exit 1
fi
printf '%s\n' "$cross_tenant_status" >"$evidence_dir/cross-tenant-create-status.txt"

missing_transport_status=$(curl --silent --show-error \
  --output "$evidence_dir/missing-web-transport.json" \
  --write-out '%{http_code}' \
  --request POST "http://127.0.0.1:8080/internal/markets" \
  --header 'content-type: application/json' \
  --header "x-admin-demo-token: $admin_token" \
  --header "x-crownfi-user-id: $owner_id" \
  --data "$market_body")
if [[ "$missing_transport_status" != "401" ]]; then
  echo "Expected internal market creation without the web transport token to return 401, got $missing_transport_status" >&2
  exit 1
fi
printf '%s
' "$missing_transport_status" >"$evidence_dir/missing-web-transport-status.txt"

admin_post \
  "http://127.0.0.1:8080/internal/markets" \
  "$evidence_dir/market-created.json" \
  "$owner_id" \
  "$market_body"
market_id=$(json_field "$evidence_dir/market-created.json" market.id)
yes_outcome_id=$(json_field "$evidence_dir/market-created.json" outcomes.0.id)

admin_post \
  "http://127.0.0.1:8080/internal/markets/$market_id/transitions" \
  "$evidence_dir/market-pending-review.json" \
  "$owner_id" \
  '{"target_status":"pending_review","reason":"Organizer configuration is complete.","evidence":{}}'
admin_post \
  "http://127.0.0.1:8080/internal/markets/$market_id/transitions" \
  "$evidence_dir/market-approved.json" \
  "$owner_id" \
  '{"target_status":"approved","reason":"Site administrator approved the Testnet market.","evidence":{"review":"smoke"}}'
admin_post \
  "http://127.0.0.1:8080/internal/markets/$market_id/policy-decisions" \
  "$evidence_dir/policy-open.json" \
  "$owner_id" \
  '{"action":"market.open","decision":"allow","reason":"Configuration and exposure limits reviewed.","policy_version":"hackathon-testnet-v1"}'
admin_post \
  "http://127.0.0.1:8080/internal/markets/$market_id/transitions" \
  "$evidence_dir/market-open.json" \
  "$owner_id" \
  '{"target_status":"open","reason":"Open for tiny Testnet stakes.","evidence":{"review":"smoke"}}'

stake_body="{\"outcome_id\":\"$yes_outcome_id\",\"wallet_address\":\"$wallet_address\",\"amount_minor\":2000}"
policy_denial_status=$(curl --silent --show-error \
  --output "$evidence_dir/stake-before-policy.json" \
  --write-out '%{http_code}' \
  --request POST "http://127.0.0.1:8080/internal/markets/$market_id/stake-intents" \
  --header 'content-type: application/json' \
  --header "x-admin-demo-token: $admin_token" \
  --header "x-crownfi-user-id: $owner_id" \
  --header 'idempotency-key: market-smoke-denied' \
  --data "$stake_body")
if [[ "$policy_denial_status" != "403" ]]; then
  echo "Expected stake without policy allow to return 403, got $policy_denial_status" >&2
  exit 1
fi
printf '%s\n' "$policy_denial_status" >"$evidence_dir/stake-before-policy-status.txt"

policy_body="{\"subject_user_id\":\"$owner_id\",\"action\":\"stake\",\"decision\":\"allow\",\"reason\":\"Disposable Testnet wallet approved for tiny smoke stake.\",\"policy_version\":\"hackathon-testnet-v1\"}"
admin_post \
  "http://127.0.0.1:8080/internal/markets/$market_id/policy-decisions" \
  "$evidence_dir/policy-stake.json" \
  "$owner_id" \
  "$policy_body"

curl --fail --silent --show-error \
  --request POST "http://127.0.0.1:8080/internal/markets/$market_id/stake-intents" \
  --header 'content-type: application/json' \
  --header "x-admin-demo-token: $admin_token" \
  --header "x-crownfi-user-id: $owner_id" \
  --header 'idempotency-key: market-smoke-1' \
  --data "$stake_body" >"$evidence_dir/stake-intent-first.json"
curl --fail --silent --show-error \
  --request POST "http://127.0.0.1:8080/internal/markets/$market_id/stake-intents" \
  --header 'content-type: application/json' \
  --header "x-admin-demo-token: $admin_token" \
  --header "x-crownfi-user-id: $owner_id" \
  --header 'idempotency-key: market-smoke-1' \
  --data "$stake_body" >"$evidence_dir/stake-intent-replay.json"
intent_id=$(json_field "$evidence_dir/stake-intent-first.json" id)
foreign_intent_status=$(curl --silent --show-error \
  --output "$evidence_dir/foreign-intent-read.json" \
  --write-out '%{http_code}' \
  --header "x-crownfi-web-token: $web_token" \
  --header "x-crownfi-user-id: $other_user_id" \
  "http://127.0.0.1:8080/internal/market-intents/$intent_id")
if [[ "$foreign_intent_status" != "404" ]]; then
  echo "Expected another tenant to receive concealed 404 for the stake intent, got $foreign_intent_status" >&2
  exit 1
fi
printf '%s
' "$foreign_intent_status" >"$evidence_dir/foreign-intent-read-status.txt"
replay_intent_id=$(json_field "$evidence_dir/stake-intent-replay.json" id)
if [[ "$intent_id" != "$replay_intent_id" ]]; then
  echo "Exact stake-intent replay created a different intent" >&2
  exit 1
fi

changed_status=$(curl --silent --show-error \
  --output "$evidence_dir/stake-intent-changed.json" \
  --write-out '%{http_code}' \
  --request POST "http://127.0.0.1:8080/internal/markets/$market_id/stake-intents" \
  --header 'content-type: application/json' \
  --header "x-admin-demo-token: $admin_token" \
  --header "x-crownfi-user-id: $owner_id" \
  --header 'idempotency-key: market-smoke-1' \
  --data "{\"outcome_id\":\"$yes_outcome_id\",\"wallet_address\":\"$wallet_address\",\"amount_minor\":3000}")
if [[ "$changed_status" != "409" ]]; then
  echo "Expected changed idempotent replay to return 409, got $changed_status" >&2
  exit 1
fi
printf '%s\n' "$changed_status" >"$evidence_dir/stake-intent-changed-status.txt"

transaction_hash=$(printf 'a%.0s' {1..64})
admin_post \
  "http://127.0.0.1:8080/internal/market-intents/$intent_id/submission" \
  "$evidence_dir/stake-intent-submitted.json" \
  "$owner_id" \
  "{\"tx_hash\":\"$transaction_hash\"}"

"${compose[@]}" restart api
wait_for_url "http://127.0.0.1:8080/ready"
server_get \
  "http://127.0.0.1:8080/internal/market-intents/$intent_id" \
  "$evidence_dir/stake-intent-after-restart.json" \
  "$owner_id"
curl --fail --silent --show-error \
  "http://127.0.0.1:8080/markets/$market_id" \
  >"$evidence_dir/market-public-after-restart.json"

python3 - "$evidence_dir/stake-intent-after-restart.json" "$evidence_dir/market-public-after-restart.json" "$intent_id" "$market_id" <<'PY'
import json
import sys

intent_path, market_path, intent_id, market_id = sys.argv[1:]
with open(intent_path, encoding="utf-8") as handle:
    intent = json.load(handle)
with open(market_path, encoding="utf-8") as handle:
    market = json.load(handle)

assert intent["id"] == intent_id
assert intent["market_id"] == market_id
assert intent["status"] == "submitted"
assert intent["submitted_tx_hash"] == "a" * 64
assert market["market"]["id"] == market_id
assert market["market"]["status"] == "open"
assert [outcome["code"] for outcome in market["outcomes"]] == ["YES", "NO"]
PY

"${compose[@]}" exec -T postgres psql \
  -U "${POSTGRES_USER:-crownfi}" \
  -d "${POSTGRES_DB:-crownfi}" \
  -Atc "SELECT (SELECT count(*) FROM prediction_market_stake_intents WHERE id = '$intent_id') || ':' || (SELECT count(*) FROM prediction_market_positions WHERE stake_intent_id = '$intent_id') || ':' || (SELECT count(*) FROM audit_logs WHERE organization_id = '$organization_id' AND action LIKE 'prediction_market.%');" \
  | tee "$evidence_dir/durable-counts.txt"
if [[ "$(cat "$evidence_dir/durable-counts.txt")" != "1:0:7" ]]; then
  echo "Expected one durable submitted intent, zero active positions before reconciliation, and seven audit records" >&2
  exit 1
fi

"${compose[@]}" exec -T postgres psql \
  -U "${POSTGRES_USER:-crownfi}" \
  -d "${POSTGRES_DB:-crownfi}" \
  -Atc "SELECT capability || ':' || decision FROM authorization_decisions WHERE capability LIKE 'prediction_market.%' ORDER BY created_at, id;" \
  | tee "$evidence_dir/authorization-decisions.txt"
grep -q '^prediction_market.create:allow$' "$evidence_dir/authorization-decisions.txt"
grep -q '^prediction_market.create:deny$' "$evidence_dir/authorization-decisions.txt"
grep -q '^prediction_market.policy.manage:allow$' "$evidence_dir/authorization-decisions.txt"
grep -q '^prediction_market.stake:allow$' "$evidence_dir/authorization-decisions.txt"
grep -q '^prediction_market.intent.read:deny$' "$evidence_dir/authorization-decisions.txt"
grep -q '^prediction_market.intent.write:allow$' "$evidence_dir/authorization-decisions.txt"

"${compose[@]}" ps --all | tee "$evidence_dir/compose-ps.txt"
echo "CrownFi prediction-market foundation smoke test passed."
