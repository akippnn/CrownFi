#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$repo_root"

env_file="${CROWNFI_STELLAR_INTENTS_ENV_FILE:-infra/.env.stellar-intents-smoke}"
evidence_dir="${CROWNFI_STELLAR_INTENTS_EVIDENCE_DIR:-.artifacts/acceptance/stellar-transaction-intents}"
timeout_seconds="${CROWNFI_STELLAR_INTENTS_TIMEOUT_SECONDS:-1200}"
admin_token="${CROWNFI_STELLAR_INTENTS_ADMIN_TOKEN:-local-admin-demo-token}"
project_name="${CROWNFI_STELLAR_INTENTS_PROJECT:-crownfi-stellar-intents-${GITHUB_RUN_ID:-local}}"
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

create_order_fixture() {
  local suffix=$1
  local product_file="$evidence_dir/product-$suffix.json"
  local order_file="$evidence_dir/order-$suffix.json"
  local attempt_file="$evidence_dir/payment-attempt-$suffix.json"

  admin_post \
    "http://127.0.0.1:8080/admin/platform/organizations/$organization_id/products" \
    "$product_file" \
    "$owner_id" \
    "{\"kind\":\"collectible\",\"name\":\"Stellar Intent Collectible $suffix\",\"slug\":\"stellar-intent-$suffix\",\"status\":\"published\",\"amount_minor\":2500000,\"asset_code\":\"XLM\",\"asset_scale\":7,\"supply_limit\":1}"
  local product_id
  local price_id
  product_id=$(json_field "$product_file" product.id)
  price_id=$(json_field "$product_file" prices.0.id)

  admin_post \
    "http://127.0.0.1:8080/admin/platform/organizations/$organization_id/orders" \
    "$order_file" \
    "$owner_id" \
    "{\"product_id\":\"$product_id\",\"price_id\":\"$price_id\",\"quantity\":1,\"environment\":\"testnet\",\"idempotency_key\":\"stellar-order-$suffix\"}"
  local order_id
  order_id=$(json_field "$order_file" order.id)

  admin_post \
    "http://127.0.0.1:8080/admin/platform/orders/$order_id/payment-attempts" \
    "$attempt_file" \
    "$owner_id" \
    "{\"provider\":\"stellar-testnet\",\"provider_reference\":\"stellar-attempt-$suffix\",\"payer_account\":\"$source_account\"}"
  local payment_attempt_id
  payment_attempt_id=$(json_field "$attempt_file" id)
  printf '%s:%s\n' "$order_id" "$payment_attempt_id"
}

make_signed_envelope() {
  local intent_file=$1
  local output_file=$2
  local mutate_memo=${3:-false}
  python3 - "$intent_file" "$output_file" "$mutate_memo" <<'PY'
import base64
import json
import struct
import sys

intent_path, output_path, mutate_memo = sys.argv[1:]
with open(intent_path, encoding="utf-8") as handle:
    payload = json.load(handle)
raw = bytearray(base64.b64decode(payload["intent"]["unsigned_envelope_xdr"], validate=True))
assert raw[-4:] == b"\x00\x00\x00\x00", "unsigned envelope must have zero signatures"
if mutate_memo == "true":
    marker = raw.find(b"CFI-")
    assert marker >= 0, "expected CrownFi memo"
    raw[marker] = ord("D")
raw[-4:] = struct.pack(">I", 1)
raw += b"\x00\x00\x00\x00"
raw += struct.pack(">I", 64)
raw += bytes(range(64))
with open(output_path, "w", encoding="utf-8") as handle:
    json.dump({"signed_envelope_xdr": base64.b64encode(raw).decode("ascii")}, handle)
PY
}

"${compose[@]}" up --build --detach postgres redis db-init api
wait_for_url "http://127.0.0.1:8080/ready"

curl --fail --silent --show-error \
  --request POST "http://127.0.0.1:8080/admin/platform/bootstrap" \
  --header 'content-type: application/json' \
  --header "x-admin-demo-token: $admin_token" \
  --data '{"display_name":"Stellar Intent Owner","email":"stellar-intent-owner@example.test","organization_name":"Stellar Intent Smoke Organization","organization_slug":"stellar-intent-smoke"}' \
  >"$evidence_dir/bootstrap.json"
owner_id=$(json_field "$evidence_dir/bootstrap.json" user.id)
organization_id=$(json_field "$evidence_dir/bootstrap.json" organization.id)

fixture=$(create_order_fixture exact)
order_id=${fixture%%:*}
payment_attempt_id=${fixture##*:}

intent_body="{\"payment_attempt_id\":\"$payment_attempt_id\",\"source_account\":\"$source_account\",\"destination_account\":\"$destination_account\",\"source_account_sequence\":123456789,\"base_fee\":100,\"timeout_seconds\":900,\"idempotency_key\":\"stellar-intent-exact\"}"
admin_post \
  "http://127.0.0.1:8080/admin/platform/orders/$order_id/stellar-intents" \
  "$evidence_dir/intent-first.json" \
  "$owner_id" \
  "$intent_body"
admin_post \
  "http://127.0.0.1:8080/admin/platform/orders/$order_id/stellar-intents" \
  "$evidence_dir/intent-replay.json" \
  "$owner_id" \
  "$intent_body"
intent_id=$(json_field "$evidence_dir/intent-first.json" intent.id)
replayed_intent_id=$(json_field "$evidence_dir/intent-replay.json" intent.id)
if [[ "$intent_id" != "$replayed_intent_id" ]]; then
  echo "Idempotent Stellar intent replay created a different intent" >&2
  exit 1
fi

make_signed_envelope "$evidence_dir/intent-first.json" "$evidence_dir/signed-envelope.json" false
curl --fail --silent --show-error \
  --request POST "http://127.0.0.1:8080/admin/platform/stellar-intents/$intent_id/signed-envelope" \
  --header 'content-type: application/json' \
  --header "x-admin-demo-token: $admin_token" \
  --header "x-crownfi-user-id: $owner_id" \
  --data-binary "@$evidence_dir/signed-envelope.json" \
  >"$evidence_dir/signed-accepted.json"

replay_status=$(curl --silent --show-error \
  --output "$evidence_dir/signed-replay.json" \
  --write-out '%{http_code}' \
  --request POST "http://127.0.0.1:8080/admin/platform/stellar-intents/$intent_id/signed-envelope" \
  --header 'content-type: application/json' \
  --header "x-admin-demo-token: $admin_token" \
  --header "x-crownfi-user-id: $owner_id" \
  --data-binary "@$evidence_dir/signed-envelope.json")
if [[ "$replay_status" != "200" ]]; then
  echo "Expected exact signed-envelope replay to return 200, got $replay_status" >&2
  exit 1
fi
printf '%s\n' "$replay_status" >"$evidence_dir/signed-replay-status.txt"

fixture=$(create_order_fixture mismatch)
mismatch_order_id=${fixture%%:*}
mismatch_attempt_id=${fixture##*:}
admin_post \
  "http://127.0.0.1:8080/admin/platform/orders/$mismatch_order_id/stellar-intents" \
  "$evidence_dir/intent-mismatch.json" \
  "$owner_id" \
  "{\"payment_attempt_id\":\"$mismatch_attempt_id\",\"source_account\":\"$source_account\",\"destination_account\":\"$destination_account\",\"source_account_sequence\":223456789,\"base_fee\":100,\"timeout_seconds\":900,\"idempotency_key\":\"stellar-intent-mismatch\"}"
mismatch_intent_id=$(json_field "$evidence_dir/intent-mismatch.json" intent.id)
make_signed_envelope "$evidence_dir/intent-mismatch.json" "$evidence_dir/signed-envelope-mismatch.json" true
mismatch_status=$(curl --silent --show-error \
  --output "$evidence_dir/signed-mismatch-response.json" \
  --write-out '%{http_code}' \
  --request POST "http://127.0.0.1:8080/admin/platform/stellar-intents/$mismatch_intent_id/signed-envelope" \
  --header 'content-type: application/json' \
  --header "x-admin-demo-token: $admin_token" \
  --header "x-crownfi-user-id: $owner_id" \
  --data-binary "@$evidence_dir/signed-envelope-mismatch.json")
if [[ "$mismatch_status" != "409" ]]; then
  echo "Expected mutated signed envelope to return 409, got $mismatch_status" >&2
  exit 1
fi
printf '%s\n' "$mismatch_status" >"$evidence_dir/signed-mismatch-status.txt"

"${compose[@]}" restart api
wait_for_url "http://127.0.0.1:8080/ready"
admin_get \
  "http://127.0.0.1:8080/admin/platform/stellar-intents/$intent_id" \
  "$evidence_dir/intent-after-restart.json" \
  "$owner_id"

python3 - "$evidence_dir/intent-after-restart.json" "$intent_id" "$order_id" <<'PY'
import base64
import json
import sys

path, intent_id, order_id = sys.argv[1:]
with open(path, encoding="utf-8") as handle:
    detail = json.load(handle)
intent = detail["intent"]
transaction = detail["transaction"]
assert intent["id"] == intent_id
assert intent["order_id"] == order_id
assert intent["status"] == "signed"
assert intent["network"] == "testnet"
assert intent["operation_type"] == "payment"
assert intent["amount_minor"] == 2500000
assert intent["asset_code"] == "XLM"
assert intent["asset_scale"] == 7
assert intent["asset_issuer"] is None
assert intent["transaction_sequence"] == 123456790
assert len(base64.b64decode(intent["unsigned_envelope_xdr"], validate=True)) > 80
assert len(intent["transaction_body_sha256"]) == 64
assert len(intent["unsigned_envelope_sha256"]) == 64
assert transaction is not None
assert transaction["status"] == "signed"
assert transaction["network"] == "testnet"
assert len(transaction["transaction_hash"]) == 64
assert len(transaction["envelope_sha256"]) == 64
PY

"${compose[@]}" exec -T postgres psql \
  -U "${POSTGRES_USER:-crownfi}" \
  -d "${POSTGRES_DB:-crownfi}" \
  -Atc "SELECT (SELECT count(*) FROM transaction_intents) || ':' || (SELECT count(*) FROM stellar_transactions) || ':' || (SELECT count(*) FROM audit_logs WHERE action IN ('stellar_transaction_intent.create', 'stellar_signed_envelope.accept'));" \
  | tee "$evidence_dir/database-counts.txt"
if [[ "$(cat "$evidence_dir/database-counts.txt")" != "2:1:3" ]]; then
  echo "Unexpected Stellar intent/transaction/audit counts" >&2
  exit 1
fi

"${compose[@]}" ps --all | tee "$evidence_dir/compose-ps.txt"
printf 'Stellar transaction intent smoke passed.\n' | tee "$evidence_dir/result.txt"
