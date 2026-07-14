#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$repo_root"

env_file="${CROWNFI_STELLAR_RECONCILIATION_ENV_FILE:-infra/.env.stellar-reconciliation-smoke}"
evidence_dir="${CROWNFI_STELLAR_RECONCILIATION_EVIDENCE_DIR:-.artifacts/acceptance/stellar-chain-reconciliation}"
timeout_seconds="${CROWNFI_STELLAR_RECONCILIATION_TIMEOUT_SECONDS:-1200}"
admin_token="${CROWNFI_STELLAR_RECONCILIATION_ADMIN_TOKEN:-local-admin-demo-token}"
project_name="${CROWNFI_STELLAR_RECONCILIATION_PROJECT:-crownfi-stellar-reconciliation-${GITHUB_RUN_ID:-local}}"
source_account="GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF"
destination_account="GAAQEAYEAUDAOCAJBIFQYDIOB4IBCEQTCQKRMFYYDENBWHA5DYPSABOV"

for command in docker curl python3; do
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
    --header "x-admin-demo-token: $admin_token" \
    --header "x-crownfi-user-id: $actor_id" \
    --data "$body" >"$output"
}

admin_get() {
  local url=$1
  local output=$2
  local actor_id=$3
  curl --fail --silent --show-error \
    --header "x-admin-demo-token: $admin_token" \
    --header "x-crownfi-user-id: $actor_id" \
    "$url" >"$output"
}

make_signed_envelope() {
  local intent_file=$1
  local output_file=$2
  python3 - "$intent_file" "$output_file" <<'PY'
import base64
import json
import struct
import sys

intent_path, output_path = sys.argv[1:]
with open(intent_path, encoding="utf-8") as handle:
    payload = json.load(handle)
raw = bytearray(base64.b64decode(payload["intent"]["unsigned_envelope_xdr"], validate=True))
assert raw[-4:] == b"\x00\x00\x00\x00"
raw[-4:] = struct.pack(">I", 1)
raw += b"\x00\x00\x00\x00"
raw += struct.pack(">I", 64)
raw += bytes(range(64))
with open(output_path, "w", encoding="utf-8") as handle:
    json.dump({"signed_envelope_xdr": base64.b64encode(raw).decode("ascii")}, handle)
PY
}

make_contract_id() {
  python3 <<'PY'
import base64

payload = bytearray([16]) + bytearray(32)
crc = 0
for byte in payload:
    crc ^= byte << 8
    for _ in range(8):
        crc = ((crc << 1) ^ 0x1021) & 0xffff if crc & 0x8000 else (crc << 1) & 0xffff
payload += crc.to_bytes(2, "little")
print(base64.b32encode(payload).decode("ascii").rstrip("="))
PY
}

"${compose[@]}" up --build --detach postgres redis db-init api
wait_for_url "http://127.0.0.1:8080/ready"

curl --fail --silent --show-error \
  --request POST "http://127.0.0.1:8080/admin/platform/bootstrap" \
  --header 'content-type: application/json' \
  --header "x-admin-demo-token: $admin_token" \
  --data '{"display_name":"Chain Reconciliation Owner","email":"chain-reconciliation-owner@example.test","organization_name":"Chain Reconciliation Smoke Organization","organization_slug":"chain-reconciliation-smoke"}' \
  >"$evidence_dir/bootstrap.json"
owner_id=$(json_field "$evidence_dir/bootstrap.json" user.id)
organization_id=$(json_field "$evidence_dir/bootstrap.json" organization.id)

contract_id=$(make_contract_id)
admin_post \
  "http://127.0.0.1:8080/admin/platform/contract-deployments" \
  "$evidence_dir/contract-deployment.json" \
  "$owner_id" \
  "{\"network\":\"testnet\",\"contract_kind\":\"collectible\",\"contract_id\":\"$contract_id\",\"status\":\"recorded_unverified\",\"metadata\":{\"source\":\"reconciliation-smoke\"}}"

admin_post \
  "http://127.0.0.1:8080/admin/platform/organizations/$organization_id/products" \
  "$evidence_dir/product.json" \
  "$owner_id" \
  '{"kind":"collectible","name":"Chain Reconciliation Collectible","slug":"chain-reconciliation-collectible","status":"published","amount_minor":2500000,"asset_code":"XLM","asset_scale":7,"supply_limit":1}'
product_id=$(json_field "$evidence_dir/product.json" product.id)
price_id=$(json_field "$evidence_dir/product.json" prices.0.id)

admin_post \
  "http://127.0.0.1:8080/admin/platform/organizations/$organization_id/orders" \
  "$evidence_dir/order.json" \
  "$owner_id" \
  "{\"product_id\":\"$product_id\",\"price_id\":\"$price_id\",\"quantity\":1,\"environment\":\"testnet\",\"idempotency_key\":\"chain-reconciliation-order\"}"
order_id=$(json_field "$evidence_dir/order.json" order.id)

admin_post \
  "http://127.0.0.1:8080/admin/platform/orders/$order_id/payment-attempts" \
  "$evidence_dir/payment-attempt.json" \
  "$owner_id" \
  "{\"provider\":\"stellar-testnet\",\"provider_reference\":\"chain-reconciliation-attempt\",\"payer_account\":\"$source_account\"}"
payment_attempt_id=$(json_field "$evidence_dir/payment-attempt.json" id)

admin_post \
  "http://127.0.0.1:8080/admin/platform/orders/$order_id/stellar-intents" \
  "$evidence_dir/intent.json" \
  "$owner_id" \
  "{\"payment_attempt_id\":\"$payment_attempt_id\",\"source_account\":\"$source_account\",\"destination_account\":\"$destination_account\",\"source_account_sequence\":323456789,\"base_fee\":100,\"timeout_seconds\":900,\"idempotency_key\":\"chain-reconciliation-intent\"}"
intent_id=$(json_field "$evidence_dir/intent.json" intent.id)
make_signed_envelope "$evidence_dir/intent.json" "$evidence_dir/signed-envelope.json"

curl --fail --silent --show-error \
  --request POST "http://127.0.0.1:8080/admin/platform/stellar-intents/$intent_id/signed-envelope" \
  --header 'content-type: application/json' \
  --header "x-admin-demo-token: $admin_token" \
  --header "x-crownfi-user-id: $owner_id" \
  --data-binary "@$evidence_dir/signed-envelope.json" \
  >"$evidence_dir/signed.json"
transaction_hash=$(json_field "$evidence_dir/signed.json" transaction.transaction_hash)
memo_text=$(json_field "$evidence_dir/signed.json" intent.memo_text)

admin_post \
  "http://127.0.0.1:8080/admin/platform/stellar-intents/$intent_id/submission-receipt" \
  "$evidence_dir/submitted.json" \
  "$owner_id" \
  "{\"transaction_hash\":\"$transaction_hash\",\"horizon_status_code\":200,\"horizon_response\":{\"hash\":\"$transaction_hash\",\"successful\":true,\"source\":\"offline-smoke-not-chain-proof\"}}"

closed_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)
python3 - "$evidence_dir/rejected-evidence.json" "$transaction_hash" "$source_account" "$destination_account" "$memo_text" "$closed_at" <<'PY'
import json
import sys

path, tx_hash, source, destination, memo, closed_at = sys.argv[1:]
body = {
    "transaction_hash": tx_hash,
    "ledger_sequence": 999999,
    "operation_index": 1,
    "paging_token": "9999990000002",
    "source_account": source,
    "destination_account": destination,
    "amount_minor": 2499999,
    "asset_code": "XLM",
    "asset_scale": 7,
    "asset_issuer": None,
    "memo_text": memo,
    "transaction_successful": True,
    "closed_at": closed_at,
    "raw_transaction": {
        "hash": tx_hash,
        "successful": True,
        "ledger": 999999,
        "memo_type": "text",
        "memo": memo,
        "created_at": closed_at,
    },
    "raw_operation": {
        "type": "payment",
        "transaction_hash": tx_hash,
        "paging_token": "9999990000002",
        "source_account": source,
        "to": destination,
        "amount": "0.2499999",
        "asset_type": "native",
    },
}
with open(path, "w", encoding="utf-8") as handle:
    json.dump(body, handle)
PY

rejected_status=$(curl --silent --show-error \
  --output "$evidence_dir/rejected-response.json" \
  --write-out '%{http_code}' \
  --request POST "http://127.0.0.1:8080/admin/platform/stellar-intents/$intent_id/chain-evidence" \
  --header 'content-type: application/json' \
  --header "x-admin-demo-token: $admin_token" \
  --header "x-crownfi-user-id: $owner_id" \
  --data-binary "@$evidence_dir/rejected-evidence.json")
if [[ "$rejected_status" != "409" ]]; then
  echo "Expected mismatched chain evidence to return 409, got $rejected_status" >&2
  exit 1
fi
printf '%s\n' "$rejected_status" >"$evidence_dir/rejected-status.txt"
admin_get \
  "http://127.0.0.1:8080/admin/platform/orders/$order_id" \
  "$evidence_dir/order-after-rejection.json" \
  "$owner_id"
if [[ "$(json_field "$evidence_dir/order-after-rejection.json" order.status)" != "awaiting_payment" ]]; then
  echo "Rejected chain evidence changed the order state" >&2
  exit 1
fi

python3 - "$evidence_dir/accepted-evidence.json" "$transaction_hash" "$source_account" "$destination_account" "$memo_text" "$closed_at" <<'PY'
import json
import sys

path, tx_hash, source, destination, memo, closed_at = sys.argv[1:]
body = {
    "transaction_hash": tx_hash,
    "ledger_sequence": 999999,
    "operation_index": 0,
    "paging_token": "9999990000001",
    "source_account": source,
    "destination_account": destination,
    "amount_minor": 2500000,
    "asset_code": "XLM",
    "asset_scale": 7,
    "asset_issuer": None,
    "memo_text": memo,
    "transaction_successful": True,
    "closed_at": closed_at,
    "raw_transaction": {
        "hash": tx_hash,
        "successful": True,
        "ledger": 999999,
        "memo_type": "text",
        "memo": memo,
        "created_at": closed_at,
    },
    "raw_operation": {
        "type": "payment",
        "transaction_hash": tx_hash,
        "paging_token": "9999990000001",
        "source_account": source,
        "to": destination,
        "amount": "0.2500000",
        "asset_type": "native",
    },
}
with open(path, "w", encoding="utf-8") as handle:
    json.dump(body, handle)
PY

curl --fail --silent --show-error \
  --request POST "http://127.0.0.1:8080/admin/platform/stellar-intents/$intent_id/chain-evidence" \
  --header 'content-type: application/json' \
  --header "x-admin-demo-token: $admin_token" \
  --header "x-crownfi-user-id: $owner_id" \
  --data-binary "@$evidence_dir/accepted-evidence.json" \
  >"$evidence_dir/accepted-response.json"

accepted_replay_status=$(curl --silent --show-error \
  --output "$evidence_dir/accepted-replay.json" \
  --write-out '%{http_code}' \
  --request POST "http://127.0.0.1:8080/admin/platform/stellar-intents/$intent_id/chain-evidence" \
  --header 'content-type: application/json' \
  --header "x-admin-demo-token: $admin_token" \
  --header "x-crownfi-user-id: $owner_id" \
  --data-binary "@$evidence_dir/accepted-evidence.json")
if [[ "$accepted_replay_status" != "200" ]]; then
  echo "Expected exact accepted evidence replay to return 200, got $accepted_replay_status" >&2
  exit 1
fi
printf '%s\n' "$accepted_replay_status" >"$evidence_dir/accepted-replay-status.txt"

"${compose[@]}" restart api
wait_for_url "http://127.0.0.1:8080/ready"
admin_get \
  "http://127.0.0.1:8080/admin/platform/stellar-intents/$intent_id/reconciliation" \
  "$evidence_dir/reconciliation-after-restart.json" \
  "$owner_id"
admin_get \
  "http://127.0.0.1:8080/admin/platform/orders/$order_id" \
  "$evidence_dir/order-after-restart.json" \
  "$owner_id"

python3 - "$evidence_dir/reconciliation-after-restart.json" "$evidence_dir/order-after-restart.json" "$transaction_hash" <<'PY'
import json
import sys

reconciliation_path, order_path, tx_hash = sys.argv[1:]
with open(reconciliation_path, encoding="utf-8") as handle:
    result = json.load(handle)
with open(order_path, encoding="utf-8") as handle:
    order = json.load(handle)
assert result["reconciliation"]["status"] == "accepted"
assert result["reconciliation"]["failure_code"] is None
assert result["evidence"]["transaction_hash"] == tx_hash
assert result["intent_status"] == "confirmed"
assert result["stellar_transaction_status"] == "confirmed"
assert result["payment_attempt_status"] == "confirmed"
assert result["order_status"] == "paid"
assert order["order"]["status"] == "paid"
assert order["payment_attempts"][0]["status"] == "confirmed"
PY

"${compose[@]}" exec -T postgres psql \
  -U "${POSTGRES_USER:-crownfi}" \
  -d "${POSTGRES_DB:-crownfi}" \
  -Atc "SELECT (SELECT count(*) FROM contract_deployments) || ':' || (SELECT count(*) FROM stellar_chain_evidence) || ':' || (SELECT count(*) FROM stellar_reconciliation_results) || ':' || (SELECT count(*) FROM stellar_reconciliation_results WHERE status = 'accepted') || ':' || (SELECT count(*) FROM stellar_chain_cursors WHERE consumer_name = 'commerce-payments-v1');" \
  | tee "$evidence_dir/database-counts.txt"
if [[ "$(cat "$evidence_dir/database-counts.txt")" != "1:2:2:1:1" ]]; then
  echo "Unexpected contract/evidence/reconciliation/cursor counts" >&2
  exit 1
fi

"${compose[@]}" ps --all | tee "$evidence_dir/compose-ps.txt"
printf 'Offline Stellar reconciliation validation passed; this is not real Testnet evidence.\n' \
  | tee "$evidence_dir/result.txt"
