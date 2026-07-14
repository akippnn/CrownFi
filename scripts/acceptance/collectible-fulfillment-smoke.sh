#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$repo_root"

env_file="${CROWNFI_FULFILLMENT_ENV_FILE:-infra/.env.fulfillment-smoke}"
evidence_dir="${CROWNFI_FULFILLMENT_EVIDENCE_DIR:-.artifacts/acceptance/collectible-fulfillment}"
timeout_seconds="${CROWNFI_FULFILLMENT_TIMEOUT_SECONDS:-1200}"
admin_token="${CROWNFI_FULFILLMENT_ADMIN_TOKEN:-local-admin-demo-token}"
project_name="${CROWNFI_FULFILLMENT_PROJECT:-crownfi-fulfillment-${GITHUB_RUN_ID:-local}}"
source_account="GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF"
destination_account="GAAQEAYEAUDAOCAJBIFQYDIOB4IBCEQTCQKRMFYYDENBWHA5DYPSABOV"
collectible_contract="CAZOOO3AUNGKDE6XTQNHETSBJGU33I2OCNREZ63GTUTDRPYBUS2R4LZX"
metadata_sha256="aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
mint_transaction_hash="bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"

for command in docker curl python3; do
  command -v "$command" >/dev/null 2>&1 || { echo "Required command not found: $command" >&2; exit 1; }
done
docker compose version >/dev/null

if [[ ! -f "$env_file" ]]; then cp infra/.env.example "$env_file"; fi
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
  local started_at
  started_at=$(date +%s)
  until curl --fail --silent --show-error "$1" >/dev/null; do
    if (( $(date +%s) - started_at >= timeout_seconds )); then return 1; fi
    sleep 3
  done
}

json_field() {
  python3 - "$1" "$2" <<'PY'
import json, sys
with open(sys.argv[1], encoding="utf-8") as handle: value = json.load(handle)
for part in sys.argv[2].split("."): value = value[int(part)] if isinstance(value, list) else value[part]
print("" if value is None else value)
PY
}

admin_post() {
  curl --fail --silent --show-error --request POST \
    --header 'content-type: application/json' \
    --header "x-admin-demo-token: $admin_token" \
    --header "x-crownfi-user-id: $3" \
    --data "$4" "$1" >"$2"
}

admin_get() {
  curl --fail --silent --show-error \
    --header "x-admin-demo-token: $admin_token" \
    --header "x-crownfi-user-id: $3" "$1" >"$2"
}

make_signed_envelope() {
  python3 - "$1" "$2" <<'PY'
import base64, json, struct, sys
with open(sys.argv[1], encoding="utf-8") as handle: payload = json.load(handle)
raw = bytearray(base64.b64decode(payload["intent"]["unsigned_envelope_xdr"], validate=True))
assert raw[-4:] == b"\x00\x00\x00\x00"
raw[-4:] = struct.pack(">I", 1)
raw += b"\x00\x00\x00\x00" + struct.pack(">I", 64) + bytes(range(64))
with open(sys.argv[2], "w", encoding="utf-8") as handle:
    json.dump({"signed_envelope_xdr": base64.b64encode(raw).decode("ascii")}, handle)
PY
}

"${compose[@]}" up --build --detach postgres redis db-init api
wait_for_url "http://127.0.0.1:8080/ready"

curl --fail --silent --show-error --request POST \
  "http://127.0.0.1:8080/admin/platform/bootstrap" \
  --header 'content-type: application/json' \
  --header "x-admin-demo-token: $admin_token" \
  --data '{"display_name":"Fulfillment Owner","email":"fulfillment-owner@example.test","organization_name":"Fulfillment Smoke Organization","organization_slug":"fulfillment-smoke"}' \
  >"$evidence_dir/bootstrap.json"
owner_id=$(json_field "$evidence_dir/bootstrap.json" user.id)
organization_id=$(json_field "$evidence_dir/bootstrap.json" organization.id)
wallet_id=$(python3 -c 'import uuid; print(uuid.uuid4())')
"${compose[@]}" exec -T postgres psql -U "${POSTGRES_USER:-crownfi}" -d "${POSTGRES_DB:-crownfi}" \
  -v ON_ERROR_STOP=1 \
  -c "INSERT INTO stellar_accounts (id,user_id,network,address,is_primary,verified_at) VALUES ('$wallet_id','$owner_id','testnet','$source_account',true,now());" \
  >"$evidence_dir/wallet-link.txt"

admin_post \
  "http://127.0.0.1:8080/admin/platform/organizations/$organization_id/products" \
  "$evidence_dir/product.json" "$owner_id" \
  '{"kind":"collectible","name":"Fulfillment Collectible","slug":"fulfillment-collectible","status":"published","amount_minor":2500000,"asset_code":"XLM","asset_scale":7,"supply_limit":1}'
product_id=$(json_field "$evidence_dir/product.json" product.id)
price_id=$(json_field "$evidence_dir/product.json" prices.0.id)

admin_post \
  "http://127.0.0.1:8080/admin/platform/organizations/$organization_id/collectible-collections" \
  "$evidence_dir/collection.json" "$owner_id" \
  "{\"name\":\"Fulfillment Collection\",\"slug\":\"fulfillment-collection\",\"status\":\"published\",\"contract_id\":\"$collectible_contract\",\"metadata_sha256\":\"$metadata_sha256\"}"
collection_id=$(json_field "$evidence_dir/collection.json" id)
admin_post \
  "http://127.0.0.1:8080/admin/platform/collectible-collections/$collection_id/editions" \
  "$evidence_dir/edition.json" "$owner_id" \
  "{\"product_id\":\"$product_id\",\"edition_number\":1,\"supply_limit\":1,\"mint_policy\":\"on_purchase\",\"contract_id\":\"$collectible_contract\",\"metadata_sha256\":\"$metadata_sha256\"}"

admin_post \
  "http://127.0.0.1:8080/admin/platform/organizations/$organization_id/orders" \
  "$evidence_dir/order.json" "$owner_id" \
  "{\"product_id\":\"$product_id\",\"price_id\":\"$price_id\",\"quantity\":1,\"environment\":\"testnet\",\"idempotency_key\":\"fulfillment-order\"}"
order_id=$(json_field "$evidence_dir/order.json" order.id)
admin_post \
  "http://127.0.0.1:8080/admin/platform/orders/$order_id/payment-attempts" \
  "$evidence_dir/payment-attempt.json" "$owner_id" \
  "{\"provider\":\"stellar-testnet\",\"provider_reference\":\"fulfillment-payment\",\"payer_account\":\"$source_account\"}"
payment_attempt_id=$(json_field "$evidence_dir/payment-attempt.json" id)
admin_post \
  "http://127.0.0.1:8080/admin/platform/orders/$order_id/stellar-intents" \
  "$evidence_dir/intent.json" "$owner_id" \
  "{\"payment_attempt_id\":\"$payment_attempt_id\",\"source_account\":\"$source_account\",\"destination_account\":\"$destination_account\",\"source_account_sequence\":423456789,\"base_fee\":100,\"timeout_seconds\":900,\"idempotency_key\":\"fulfillment-intent\"}"
intent_id=$(json_field "$evidence_dir/intent.json" intent.id)
make_signed_envelope "$evidence_dir/intent.json" "$evidence_dir/signed-envelope.json"
curl --fail --silent --show-error --request POST \
  "http://127.0.0.1:8080/admin/platform/stellar-intents/$intent_id/signed-envelope" \
  --header 'content-type: application/json' \
  --header "x-admin-demo-token: $admin_token" --header "x-crownfi-user-id: $owner_id" \
  --data-binary "@$evidence_dir/signed-envelope.json" >"$evidence_dir/signed.json"
payment_transaction_hash=$(json_field "$evidence_dir/signed.json" transaction.transaction_hash)
memo_text=$(json_field "$evidence_dir/signed.json" intent.memo_text)
admin_post \
  "http://127.0.0.1:8080/admin/platform/stellar-intents/$intent_id/submission-receipt" \
  "$evidence_dir/payment-submitted.json" "$owner_id" \
  "{\"transaction_hash\":\"$payment_transaction_hash\",\"horizon_status_code\":200,\"horizon_response\":{\"hash\":\"$payment_transaction_hash\",\"successful\":true}}"
closed_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)
python3 - "$evidence_dir/payment-evidence.json" "$payment_transaction_hash" "$source_account" "$destination_account" "$memo_text" "$closed_at" <<'PY'
import json, sys
path, tx_hash, source, destination, memo, closed_at = sys.argv[1:]
body = {
 "transaction_hash": tx_hash, "ledger_sequence": 1000001, "operation_index": 0,
 "paging_token": "10000010000001", "source_account": source, "destination_account": destination,
 "amount_minor": 2500000, "asset_code": "XLM", "asset_scale": 7, "asset_issuer": None,
 "memo_text": memo, "transaction_successful": True, "closed_at": closed_at,
 "raw_transaction": {"hash": tx_hash, "successful": True, "ledger": 1000001, "memo_type": "text", "memo": memo, "created_at": closed_at},
 "raw_operation": {"type": "payment", "transaction_hash": tx_hash, "paging_token": "10000010000001", "source_account": source, "to": destination, "amount": "0.2500000", "asset_type": "native"}
}
with open(path, "w", encoding="utf-8") as handle: json.dump(body, handle)
PY
curl --fail --silent --show-error --request POST \
  "http://127.0.0.1:8080/admin/platform/stellar-intents/$intent_id/chain-evidence" \
  --header 'content-type: application/json' --header "x-admin-demo-token: $admin_token" \
  --header "x-crownfi-user-id: $owner_id" --data-binary "@$evidence_dir/payment-evidence.json" \
  >"$evidence_dir/payment-confirmed.json"

fulfillment_body="{\"recipient_account\":\"$source_account\",\"idempotency_key\":\"fulfillment-job-1\",\"max_attempts\":5}"
admin_post \
  "http://127.0.0.1:8080/admin/platform/orders/$order_id/fulfillment-jobs" \
  "$evidence_dir/fulfillment-first.json" "$owner_id" "$fulfillment_body"
admin_post \
  "http://127.0.0.1:8080/admin/platform/orders/$order_id/fulfillment-jobs" \
  "$evidence_dir/fulfillment-replay.json" "$owner_id" "$fulfillment_body"
job_id=$(json_field "$evidence_dir/fulfillment-first.json" job.id)
if [[ "$job_id" != "$(json_field "$evidence_dir/fulfillment-replay.json" job.id)" ]]; then
  echo "Fulfillment idempotency replay created another job" >&2; exit 1
fi

admin_post \
  "http://127.0.0.1:8080/admin/platform/fulfillment-jobs/$job_id/claim" \
  "$evidence_dir/claim-first.json" "$owner_id" '{"worker_id":"fulfillment-smoke-worker"}'
admin_post \
  "http://127.0.0.1:8080/admin/platform/fulfillment-jobs/$job_id/failure" \
  "$evidence_dir/retryable-failure.json" "$owner_id" \
  '{"worker_id":"fulfillment-smoke-worker","error_code":"simulated_worker_interruption","retryable":true,"retry_after_seconds":0}'
admin_post \
  "http://127.0.0.1:8080/admin/platform/fulfillment-jobs/$job_id/claim" \
  "$evidence_dir/claim-second.json" "$owner_id" '{"worker_id":"fulfillment-smoke-worker"}'

admin_post \
  "http://127.0.0.1:8080/admin/platform/fulfillment-jobs/$job_id/submission" \
  "$evidence_dir/mint-submitted.json" "$owner_id" \
  "{\"worker_id\":\"fulfillment-smoke-worker\",\"transaction_hash\":\"$mint_transaction_hash\",\"token_id\":\"1\",\"submission_response\":{\"source\":\"offline-smoke-not-chain-proof\"}}"

python3 - "$evidence_dir/mint-evidence-rejected.json" "$mint_transaction_hash" "$collectible_contract" "$destination_account" <<'PY'
import json, sys
path, tx_hash, contract, wrong_owner = sys.argv[1:]
body = {
 "transaction_hash": tx_hash, "contract_id": contract, "token_id": "1", "owner_account": wrong_owner,
 "ledger_sequence": 1000002, "event_index": 1, "successful": True,
 "raw_event": {"event_type":"mint","transaction_hash":tx_hash,"contract_id":contract,"token_id":"1","owner_account":wrong_owner,"ledger_sequence":1000002,"successful":True}
}
with open(path, "w", encoding="utf-8") as handle: json.dump(body, handle)
PY
rejected_status=$(curl --silent --show-error --output "$evidence_dir/mint-rejected-response.json" --write-out '%{http_code}' \
  --request POST "http://127.0.0.1:8080/admin/platform/fulfillment-jobs/$job_id/mint-evidence" \
  --header 'content-type: application/json' --header "x-admin-demo-token: $admin_token" \
  --header "x-crownfi-user-id: $owner_id" --data-binary "@$evidence_dir/mint-evidence-rejected.json")
if [[ "$rejected_status" != "409" ]]; then echo "Expected rejected mint evidence 409, got $rejected_status" >&2; exit 1; fi

python3 - "$evidence_dir/mint-evidence-accepted.json" "$mint_transaction_hash" "$collectible_contract" "$source_account" <<'PY'
import json, sys
path, tx_hash, contract, owner = sys.argv[1:]
body = {
 "transaction_hash": tx_hash, "contract_id": contract, "token_id": "1", "owner_account": owner,
 "ledger_sequence": 1000002, "event_index": 0, "successful": True,
 "raw_event": {"event_type":"mint","transaction_hash":tx_hash,"contract_id":contract,"token_id":"1","owner_account":owner,"ledger_sequence":1000002,"successful":True}
}
with open(path, "w", encoding="utf-8") as handle: json.dump(body, handle)
PY
curl --fail --silent --show-error --request POST \
  "http://127.0.0.1:8080/admin/platform/fulfillment-jobs/$job_id/mint-evidence" \
  --header 'content-type: application/json' --header "x-admin-demo-token: $admin_token" \
  --header "x-crownfi-user-id: $owner_id" --data-binary "@$evidence_dir/mint-evidence-accepted.json" \
  >"$evidence_dir/mint-accepted.json"
replay_status=$(curl --silent --show-error --output "$evidence_dir/mint-accepted-replay.json" --write-out '%{http_code}' \
  --request POST "http://127.0.0.1:8080/admin/platform/fulfillment-jobs/$job_id/mint-evidence" \
  --header 'content-type: application/json' --header "x-admin-demo-token: $admin_token" \
  --header "x-crownfi-user-id: $owner_id" --data-binary "@$evidence_dir/mint-evidence-accepted.json")
if [[ "$replay_status" != "200" ]]; then echo "Expected mint replay 200, got $replay_status" >&2; exit 1; fi

"${compose[@]}" restart api
wait_for_url "http://127.0.0.1:8080/ready"
admin_get "http://127.0.0.1:8080/admin/platform/fulfillment-jobs/$job_id" \
  "$evidence_dir/fulfillment-after-restart.json" "$owner_id"
python3 - "$evidence_dir/fulfillment-after-restart.json" "$source_account" "$collectible_contract" <<'PY'
import json, sys
with open(sys.argv[1], encoding="utf-8") as handle: result = json.load(handle)
assert result["job"]["status"] == "fulfilled"
assert result["job"]["attempts"] == 2
assert result["mint"]["status"] == "confirmed"
assert result["mint"]["token_id"] == "1"
assert result["latest_evidence"]["processing_status"] == "accepted"
assert result["ownership"]["owner_account"] == sys.argv[2]
assert result["ownership"]["contract_id"] == sys.argv[3]
assert result["ownership"]["token_id"] == "1"
assert result["order_status"] == "fulfilled"
PY

"${compose[@]}" exec -T postgres psql -U "${POSTGRES_USER:-crownfi}" -d "${POSTGRES_DB:-crownfi}" -Atc \
  "SELECT (SELECT count(*) FROM fulfillment_jobs) || ':' || (SELECT count(*) FROM collectible_mints) || ':' || (SELECT count(*) FROM collectible_mint_evidence) || ':' || (SELECT count(*) FROM ownership_projections) || ':' || (SELECT reserved_quantity || '/' || fulfilled_quantity FROM product_inventory WHERE product_id='$product_id');" \
  | tee "$evidence_dir/database-counts.txt"
if [[ "$(cat "$evidence_dir/database-counts.txt")" != "1:1:2:1:0/1" ]]; then
  echo "Unexpected fulfillment/mint/evidence/ownership/inventory state" >&2; exit 1
fi

"${compose[@]}" ps --all | tee "$evidence_dir/compose-ps.txt"
printf 'Offline collectible fulfillment validation passed; this is not real Testnet mint proof.\n' | tee "$evidence_dir/result.txt"
