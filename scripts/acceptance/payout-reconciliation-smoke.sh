#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$repo_root"

env_file="${CROWNFI_PAYOUT_ENV_FILE:-infra/.env.payout-smoke}"
evidence_dir="${CROWNFI_PAYOUT_EVIDENCE_DIR:-.artifacts/acceptance/payout-reconciliation}"
timeout_seconds="${CROWNFI_PAYOUT_TIMEOUT_SECONDS:-1200}"
admin_token="${CROWNFI_PAYOUT_ADMIN_TOKEN:-local-admin-demo-token}"
worker_token="${CROWNFI_PAYOUT_WORKER_TOKEN:-local-payout-worker-token}"
project_name="${CROWNFI_PAYOUT_PROJECT:-crownfi-payout-${GITHUB_RUN_ID:-local}}"
payout_tx_hash="cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"

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

make_account() {
  python3 - "$1" <<'PY'
import base64, sys
seed = int(sys.argv[1])
payload = bytearray([48]) + bytearray(((seed + index) % 256 for index in range(32)))
crc = 0
for byte in payload:
    crc ^= byte << 8
    for _ in range(8):
        crc = ((crc << 1) ^ 0x1021) & 0xffff if crc & 0x8000 else (crc << 1) & 0xffff
payload += crc.to_bytes(2, "little")
print(base64.b32encode(payload).decode("ascii").rstrip("="))
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

worker_post() {
  curl --fail --silent --show-error --request POST \
    --header 'content-type: application/json' \
    --header "x-crownfi-payout-worker-token: $worker_token" \
    --header "x-crownfi-user-id: $3" \
    --data "$4" "$1" >"$2"
}

worker_post_file() {
  curl --fail --silent --show-error --request POST \
    --header 'content-type: application/json' \
    --header "x-crownfi-payout-worker-token: $worker_token" \
    --header "x-crownfi-user-id: $3" \
    --data-binary "@$4" "$1" >"$2"
}

source_account=$(make_account 0)
candidate_account=$(make_account 40)
organizer_account=$(make_account 80)
platform_account=$(make_account 120)
payment_destination=$(make_account 160)

"${compose[@]}" up --build --detach postgres redis db-init api
wait_for_url "http://127.0.0.1:8080/ready"

curl --fail --silent --show-error --request POST \
  "http://127.0.0.1:8080/admin/platform/bootstrap" \
  --header 'content-type: application/json' \
  --header "x-admin-demo-token: $admin_token" \
  --data '{"display_name":"Payout Owner","email":"payout-owner@example.test","organization_name":"Payout Smoke Organization","organization_slug":"payout-smoke"}' \
  >"$evidence_dir/bootstrap.json"
owner_id=$(json_field "$evidence_dir/bootstrap.json" user.id)
organization_id=$(json_field "$evidence_dir/bootstrap.json" organization.id)

admin_post \
  "http://127.0.0.1:8080/admin/platform/organizations/$organization_id/products" \
  "$evidence_dir/product.json" "$owner_id" \
  '{"kind":"collectible","name":"Payout Collectible","slug":"payout-collectible","status":"published","amount_minor":2500000,"asset_code":"XLM","asset_scale":7,"supply_limit":1}'
product_id=$(json_field "$evidence_dir/product.json" product.id)
price_id=$(json_field "$evidence_dir/product.json" prices.0.id)

admin_post \
  "http://127.0.0.1:8080/admin/platform/organizations/$organization_id/orders" \
  "$evidence_dir/order.json" "$owner_id" \
  "{\"product_id\":\"$product_id\",\"price_id\":\"$price_id\",\"quantity\":1,\"environment\":\"testnet\",\"idempotency_key\":\"payout-order\"}"
order_id=$(json_field "$evidence_dir/order.json" order.id)
admin_post \
  "http://127.0.0.1:8080/admin/platform/orders/$order_id/payment-attempts" \
  "$evidence_dir/payment-attempt.json" "$owner_id" \
  "{\"provider\":\"stellar-testnet\",\"provider_reference\":\"payout-payment\",\"payer_account\":\"$source_account\"}"
payment_attempt_id=$(json_field "$evidence_dir/payment-attempt.json" id)

intent_id=$(python3 -c 'import uuid; print(uuid.uuid4())')
stellar_transaction_id=$(python3 -c 'import uuid; print(uuid.uuid4())')
chain_evidence_id=$(python3 -c 'import uuid; print(uuid.uuid4())')
reconciliation_id=$(python3 -c 'import uuid; print(uuid.uuid4())')
payment_tx_hash="dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"
"${compose[@]}" exec -T postgres psql -U "${POSTGRES_USER:-crownfi}" -d "${POSTGRES_DB:-crownfi}" -v ON_ERROR_STOP=1 <<SQL >"$evidence_dir/prerequisite-fixture.txt"
INSERT INTO transaction_intents (
  id,organization_id,order_id,payment_attempt_id,created_by_user_id,operation_type,network,
  source_account,destination_account,transaction_sequence,base_fee,amount_minor,asset_code,asset_scale,
  asset_issuer,memo_text,idempotency_key,request_sha256,transaction_body_sha256,
  unsigned_envelope_sha256,unsigned_envelope_xdr,status,expires_at,signed_at,submitted_at,confirmed_at
) VALUES (
  '$intent_id','$organization_id','$order_id','$payment_attempt_id','$owner_id','payment','testnet',
  '$source_account','$payment_destination',1,100,2500000,'XLM',7,NULL,'CFI-payout-fixture',
  'payout-fixture-intent','aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
  'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc','fixture-xdr',
  'confirmed',now()+interval '1 hour',now(),now(),now()
);
INSERT INTO stellar_transactions (
  id,transaction_intent_id,network,envelope_sha256,signed_envelope_xdr,transaction_hash,status,
  horizon_status_code,horizon_response,submitted_at,confirmed_at
) VALUES (
  '$stellar_transaction_id','$intent_id','testnet',
  'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee','fixture-signed-xdr',
  '$payment_tx_hash','confirmed',200,'{"fixture":true}',now(),now()
);
INSERT INTO stellar_chain_evidence (
  id,transaction_intent_id,stellar_transaction_id,network,transaction_hash,ledger_sequence,
  operation_index,paging_token,source_account,destination_account,amount_minor,asset_code,asset_scale,
  asset_issuer,memo_text,transaction_successful,closed_at,evidence_sha256,raw_transaction,raw_operation
) VALUES (
  '$chain_evidence_id','$intent_id','$stellar_transaction_id','testnet','$payment_tx_hash',2000001,0,
  '20000010000001','$source_account','$payment_destination',2500000,'XLM',7,NULL,'CFI-payout-fixture',
  true,now(),'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff',
  '{"fixture":true}','{"fixture":true}'
);
INSERT INTO stellar_reconciliation_results (
  id,transaction_intent_id,chain_evidence_id,status,failure_code,expected,actual,reconciled_by_user_id
) VALUES (
  '$reconciliation_id','$intent_id','$chain_evidence_id','accepted',NULL,'{"fixture":true}','{"fixture":true}','$owner_id'
);
UPDATE payment_attempts SET status='confirmed',confirmed_at=now(),updated_at=now() WHERE id='$payment_attempt_id';
UPDATE orders SET status='fulfilled',updated_at=now() WHERE id='$order_id';
SQL

admin_post \
  "http://127.0.0.1:8080/admin/platform/organizations/$organization_id/products/$product_id/payout-rules" \
  "$evidence_dir/payout-rule.json" "$owner_id" \
  "{\"source_account\":\"$source_account\",\"candidate_account\":\"$candidate_account\",\"organizer_account\":\"$organizer_account\",\"platform_account\":\"$platform_account\",\"candidate_bps\":7000,\"organizer_bps\":2000,\"platform_bps\":1000,\"status\":\"active\"}"
payout_rule_id=$(json_field "$evidence_dir/payout-rule.json" id)

batch_body="{\"payout_rule_id\":\"$payout_rule_id\",\"idempotency_key\":\"payout-batch-1\"}"
admin_post \
  "http://127.0.0.1:8080/admin/platform/orders/$order_id/payout-batches" \
  "$evidence_dir/batch-first.json" "$owner_id" "$batch_body"
admin_post \
  "http://127.0.0.1:8080/admin/platform/orders/$order_id/payout-batches" \
  "$evidence_dir/batch-replay.json" "$owner_id" "$batch_body"
batch_id=$(json_field "$evidence_dir/batch-first.json" batch.id)
if [[ "$batch_id" != "$(json_field "$evidence_dir/batch-replay.json" batch.id)" ]]; then
  echo "Payout batch replay created a different batch" >&2; exit 1
fi
python3 - "$evidence_dir/batch-first.json" <<'PY'
import json, sys
with open(sys.argv[1], encoding="utf-8") as handle: result = json.load(handle)
assert result["batch"]["status"] == "prepared"
amounts = {transfer["role"]: transfer["expected_amount_minor"] for transfer in result["transfers"]}
assert amounts == {"candidate": 1750000, "organizer": 500000, "platform": 250000}
assert sum(amounts.values()) == result["batch"]["amount_minor"] == 2500000
PY

unauthorized_status=$(curl --silent --show-error --output "$evidence_dir/worker-unauthorized.json" --write-out '%{http_code}' \
  --request POST "http://127.0.0.1:8080/internal/platform/payout-batches/$batch_id/submission" \
  --header 'content-type: application/json' --header "x-crownfi-user-id: $owner_id" \
  --data "{\"transaction_hash\":\"$payout_tx_hash\",\"submission_response\":{\"hash\":\"$payout_tx_hash\"}}")
if [[ "$unauthorized_status" != "401" ]]; then echo "Expected missing worker token to return 401" >&2; exit 1; fi

worker_post \
  "http://127.0.0.1:8080/internal/platform/payout-batches/$batch_id/submission" \
  "$evidence_dir/submitted.json" "$owner_id" \
  "{\"transaction_hash\":\"$payout_tx_hash\",\"submission_response\":{\"hash\":\"$payout_tx_hash\",\"fixture\":true}}"

write_evidence() {
  local output=$1 role=$2 recipient=$3 amount_minor=$4 decimal_amount=$5 operation_index=$6
  python3 - "$output" "$role" "$payout_tx_hash" "$operation_index" "$source_account" "$recipient" "$amount_minor" "$decimal_amount" <<'PY'
import json, sys
path, role, tx_hash, operation_index, source, recipient, amount_minor, decimal_amount = sys.argv[1:]
operation_index = int(operation_index)
body = {
  "role": role,
  "transaction_hash": tx_hash,
  "operation_index": operation_index,
  "source_account": source,
  "recipient_account": recipient,
  "amount_minor": int(amount_minor),
  "asset_code": "XLM",
  "asset_scale": 7,
  "asset_issuer": None,
  "ledger_sequence": 2000002,
  "successful": True,
  "raw_operation": {
    "type": "payment",
    "transaction_hash": tx_hash,
    "operation_index": operation_index,
    "ledger_sequence": 2000002,
    "source_account": source,
    "to": recipient,
    "amount": decimal_amount,
    "asset_type": "native"
  }
}
with open(path, "w", encoding="utf-8") as handle: json.dump(body, handle)
PY
}

write_evidence "$evidence_dir/candidate-mismatch.json" candidate "$candidate_account" 1749999 0.1749999 9
mismatch_status=$(curl --silent --show-error --output "$evidence_dir/candidate-mismatch-response.json" --write-out '%{http_code}' \
  --request POST "http://127.0.0.1:8080/internal/platform/payout-batches/$batch_id/transfer-evidence" \
  --header 'content-type: application/json' --header "x-crownfi-payout-worker-token: $worker_token" \
  --header "x-crownfi-user-id: $owner_id" --data-binary "@$evidence_dir/candidate-mismatch.json")
if [[ "$mismatch_status" != "409" ]]; then echo "Expected payout mismatch 409, got $mismatch_status" >&2; exit 1; fi

write_evidence "$evidence_dir/candidate.json" candidate "$candidate_account" 1750000 0.1750000 0
write_evidence "$evidence_dir/organizer.json" organizer "$organizer_account" 500000 0.0500000 1
write_evidence "$evidence_dir/platform.json" platform "$platform_account" 250000 0.0250000 2
worker_post_file "http://127.0.0.1:8080/internal/platform/payout-batches/$batch_id/transfer-evidence" "$evidence_dir/candidate-response.json" "$owner_id" "$evidence_dir/candidate.json"
worker_post_file "http://127.0.0.1:8080/internal/platform/payout-batches/$batch_id/transfer-evidence" "$evidence_dir/organizer-response.json" "$owner_id" "$evidence_dir/organizer.json"
worker_post_file "http://127.0.0.1:8080/internal/platform/payout-batches/$batch_id/transfer-evidence" "$evidence_dir/platform-response.json" "$owner_id" "$evidence_dir/platform.json"

replay_status=$(curl --silent --show-error --output "$evidence_dir/candidate-replay.json" --write-out '%{http_code}' \
  --request POST "http://127.0.0.1:8080/internal/platform/payout-batches/$batch_id/transfer-evidence" \
  --header 'content-type: application/json' --header "x-crownfi-payout-worker-token: $worker_token" \
  --header "x-crownfi-user-id: $owner_id" --data-binary "@$evidence_dir/candidate.json")
if [[ "$replay_status" != "200" ]]; then echo "Expected accepted payout replay 200, got $replay_status" >&2; exit 1; fi

"${compose[@]}" restart api
wait_for_url "http://127.0.0.1:8080/ready"
admin_get "http://127.0.0.1:8080/admin/platform/payout-batches/$batch_id" \
  "$evidence_dir/batch-after-restart.json" "$owner_id"
python3 - "$evidence_dir/batch-after-restart.json" "$payout_tx_hash" <<'PY'
import json, sys
with open(sys.argv[1], encoding="utf-8") as handle: result = json.load(handle)
assert result["batch"]["status"] == "confirmed"
assert result["batch"]["confirmed_transfer_count"] == 3
assert result["batch"]["submitted_transaction_hash"] == sys.argv[2]
assert all(transfer["status"] == "confirmed" for transfer in result["transfers"])
assert sum(transfer["actual_amount_minor"] for transfer in result["transfers"]) == 2500000
assert len(result["latest_evidence"]) == 3
assert all(evidence["processing_status"] == "accepted" for evidence in result["latest_evidence"])
PY

"${compose[@]}" exec -T postgres psql -U "${POSTGRES_USER:-crownfi}" -d "${POSTGRES_DB:-crownfi}" -Atc \
  "SELECT (SELECT count(*) FROM payout_rules) || ':' || (SELECT count(*) FROM payout_batches) || ':' || (SELECT count(*) FROM payout_transfers) || ':' || (SELECT count(*) FROM payout_transfer_evidence) || ':' || (SELECT sum(expected_amount_minor) FROM payout_transfers WHERE payout_batch_id='$batch_id');" \
  | tee "$evidence_dir/database-counts.txt"
if [[ "$(cat "$evidence_dir/database-counts.txt")" != "1:1:3:4:2500000" ]]; then
  echo "Unexpected payout rule/batch/transfer/evidence totals" >&2; exit 1
fi

"${compose[@]}" ps --all | tee "$evidence_dir/compose-ps.txt"
printf 'Offline payout reconciliation validation passed; this is not real Testnet transfer proof.\n' | tee "$evidence_dir/result.txt"
