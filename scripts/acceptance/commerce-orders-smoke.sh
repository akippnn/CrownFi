#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$repo_root"

env_file="${CROWNFI_ORDERS_SMOKE_ENV_FILE:-infra/.env.orders-smoke}"
evidence_dir="${CROWNFI_ORDERS_SMOKE_EVIDENCE_DIR:-.artifacts/acceptance/commerce-orders}"
timeout_seconds="${CROWNFI_ORDERS_SMOKE_TIMEOUT_SECONDS:-900}"
admin_token="${CROWNFI_ORDERS_ADMIN_TOKEN:-local-admin-demo-token}"
project_name="${CROWNFI_ORDERS_SMOKE_PROJECT:-crownfi-orders-${GITHUB_RUN_ID:-local}}"

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

"${compose[@]}" up --build --detach postgres redis db-init api
wait_for_url "http://127.0.0.1:8080/ready"

curl --fail --silent --show-error \
  --request POST "http://127.0.0.1:8080/admin/platform/bootstrap" \
  --header 'content-type: application/json' \
  --header "x-admin-demo-token: $admin_token" \
  --data '{"display_name":"Orders Owner","email":"orders-owner@example.test","organization_name":"Orders Smoke Organization","organization_slug":"orders-smoke"}' \
  >"$evidence_dir/bootstrap.json"
owner_id=$(json_field "$evidence_dir/bootstrap.json" user.id)
organization_id=$(json_field "$evidence_dir/bootstrap.json" organization.id)

admin_post \
  "http://127.0.0.1:8080/admin/platform/organizations/$organization_id/products" \
  "$evidence_dir/product.json" \
  "$owner_id" \
  '{"kind":"collectible","name":"Order Smoke Collectible","slug":"order-smoke-collectible","status":"published","amount_minor":2500000,"asset_code":"XLM","asset_scale":7,"supply_limit":1}'
product_id=$(json_field "$evidence_dir/product.json" product.id)
price_id=$(json_field "$evidence_dir/product.json" prices.0.id)

order_body="{\"product_id\":\"$product_id\",\"price_id\":\"$price_id\",\"quantity\":1,\"environment\":\"testnet\",\"idempotency_key\":\"orders-smoke-1\"}"
admin_post \
  "http://127.0.0.1:8080/admin/platform/organizations/$organization_id/orders" \
  "$evidence_dir/order-first.json" \
  "$owner_id" \
  "$order_body"
admin_post \
  "http://127.0.0.1:8080/admin/platform/organizations/$organization_id/orders" \
  "$evidence_dir/order-replay.json" \
  "$owner_id" \
  "$order_body"
order_id=$(json_field "$evidence_dir/order-first.json" order.id)
replayed_order_id=$(json_field "$evidence_dir/order-replay.json" order.id)
if [[ "$order_id" != "$replayed_order_id" ]]; then
  echo "Idempotent order replay created a different order" >&2
  exit 1
fi

admin_post \
  "http://127.0.0.1:8080/admin/platform/orders/$order_id/payment-attempts" \
  "$evidence_dir/payment-attempt.json" \
  "$owner_id" \
  '{"provider":"stellar-indexer-review","provider_reference":"attempt-orders-smoke-1"}'
payment_attempt_id=$(json_field "$evidence_dir/payment-attempt.json" id)

mismatch_status=$(curl --silent --show-error \
  --output "$evidence_dir/payment-event-mismatch.json" \
  --write-out '%{http_code}' \
  --request POST "http://127.0.0.1:8080/admin/platform/payment-attempts/$payment_attempt_id/events" \
  --header 'content-type: application/json' \
  --header "x-admin-demo-token: $admin_token" \
  --header "x-crownfi-user-id: $owner_id" \
  --data '{"provider_event_id":"orders-event-mismatch","signature_verified":true,"outcome":"confirmed","amount_minor":2499999,"asset_code":"XLM","asset_scale":7,"environment":"testnet","payload":{"transaction":"mismatch"}}')
if [[ "$mismatch_status" != "409" ]]; then
  echo "Expected mismatched payment event to return 409, got $mismatch_status" >&2
  exit 1
fi
printf '%s\n' "$mismatch_status" >"$evidence_dir/payment-event-mismatch-status.txt"

admin_post \
  "http://127.0.0.1:8080/admin/platform/payment-attempts/$payment_attempt_id/events" \
  "$evidence_dir/payment-event-confirmed.json" \
  "$owner_id" \
  '{"provider_event_id":"orders-event-confirmed","signature_verified":true,"outcome":"confirmed","amount_minor":2500000,"asset_code":"XLM","asset_scale":7,"environment":"testnet","payload":{"transaction":"confirmed"}}'

replay_status=$(curl --silent --show-error \
  --output "$evidence_dir/payment-event-replay.json" \
  --write-out '%{http_code}' \
  --request POST "http://127.0.0.1:8080/admin/platform/payment-attempts/$payment_attempt_id/events" \
  --header 'content-type: application/json' \
  --header "x-admin-demo-token: $admin_token" \
  --header "x-crownfi-user-id: $owner_id" \
  --data '{"provider_event_id":"orders-event-confirmed","signature_verified":true,"outcome":"confirmed","amount_minor":2500000,"asset_code":"XLM","asset_scale":7,"environment":"testnet","payload":{"transaction":"confirmed"}}')
if [[ "$replay_status" != "200" ]]; then
  echo "Expected exact provider-event replay to return 200, got $replay_status" >&2
  exit 1
fi
printf '%s\n' "$replay_status" >"$evidence_dir/payment-event-replay-status.txt"

"${compose[@]}" restart api
wait_for_url "http://127.0.0.1:8080/ready"
admin_get \
  "http://127.0.0.1:8080/admin/platform/orders/$order_id" \
  "$evidence_dir/order-after-restart.json" \
  "$owner_id"

python3 - "$evidence_dir/order-after-restart.json" "$order_id" "$product_id" <<'PY'
import json
import sys

path, order_id, product_id = sys.argv[1:]
with open(path, encoding="utf-8") as handle:
    detail = json.load(handle)

assert detail["order"]["id"] == order_id
assert detail["order"]["status"] == "paid"
assert detail["order"]["amount_minor"] == 2500000
assert detail["order"]["asset_code"] == "XLM"
assert detail["order"]["asset_scale"] == 7
assert detail["order"]["asset_issuer"] is None
assert len(detail["items"]) == 1
assert detail["items"][0]["product_id"] == product_id
assert detail["items"][0]["quantity"] == 1
assert detail["items"][0]["total_amount_minor"] == 2500000
assert len(detail["payment_attempts"]) == 1
assert detail["payment_attempts"][0]["status"] == "confirmed"
assert len(detail["payment_events"]) == 2
assert detail["payment_events"][0]["processing_status"] == "rejected"
assert detail["payment_events"][0]["reconciliation_error"] == "amount_mismatch"
assert detail["payment_events"][1]["processing_status"] == "processed"
assert detail["refunds"] == []
PY

"${compose[@]}" exec -T postgres psql \
  -U "${POSTGRES_USER:-crownfi}" \
  -d "${POSTGRES_DB:-crownfi}" \
  -Atc "SELECT reserved_quantity || ':' || fulfilled_quantity FROM product_inventory WHERE product_id = '$product_id';" \
  | tee "$evidence_dir/inventory.txt"
if [[ "$(cat "$evidence_dir/inventory.txt")" != "1:0" ]]; then
  echo "Order replay or payment processing changed inventory incorrectly" >&2
  exit 1
fi

"${compose[@]}" exec -T postgres psql \
  -U "${POSTGRES_USER:-crownfi}" \
  -d "${POSTGRES_DB:-crownfi}" \
  -Atc "SELECT count(*) FROM audit_logs WHERE organization_id = '$organization_id' AND action IN ('order.create', 'payment_attempt.create', 'payment_provider_event.record');" \
  | tee "$evidence_dir/order-audit-count.txt"
if [[ "$(cat "$evidence_dir/order-audit-count.txt")" != "4" ]]; then
  echo "Expected four order/payment audit records" >&2
  exit 1
fi

"${compose[@]}" ps --all | tee "$evidence_dir/compose-ps.txt"
echo "CrownFi commerce orders smoke test passed."
