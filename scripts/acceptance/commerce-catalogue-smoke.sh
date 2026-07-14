#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$repo_root"

env_file="${CROWNFI_COMMERCE_SMOKE_ENV_FILE:-infra/.env.commerce-smoke}"
evidence_dir="${CROWNFI_COMMERCE_SMOKE_EVIDENCE_DIR:-.artifacts/acceptance/commerce-catalogue}"
timeout_seconds="${CROWNFI_COMMERCE_SMOKE_TIMEOUT_SECONDS:-900}"
admin_token="${CROWNFI_COMMERCE_ADMIN_TOKEN:-local-admin-demo-token}"
project_name="${CROWNFI_COMMERCE_SMOKE_PROJECT:-crownfi-commerce-${GITHUB_RUN_ID:-local}}"

for command in docker curl python3 grep; do
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
    value = value[part]
print(value)
PY
}

post_json() {
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

"${compose[@]}" up --build --detach postgres redis db-init api
wait_for_url "http://127.0.0.1:8080/ready"

curl --fail --silent --show-error \
  --request POST "http://127.0.0.1:8080/admin/platform/bootstrap" \
  --header 'content-type: application/json' \
  --header "x-admin-demo-token: $admin_token" \
  --data '{"display_name":"Commerce Owner","email":"commerce-owner@example.test","organization_name":"Commerce Smoke Organization","organization_slug":"commerce-smoke"}' \
  >"$evidence_dir/bootstrap.json"
owner_id=$(json_field "$evidence_dir/bootstrap.json" user.id)
organization_id=$(json_field "$evidence_dir/bootstrap.json" organization.id)

post_json \
  "http://127.0.0.1:8080/admin/platform/organizations/$organization_id/pageants" \
  "$evidence_dir/pageant.json" \
  "$owner_id" \
  '{"name":"Commerce Smoke Pageant","slug":"commerce-smoke-pageant","timezone":"Asia/Manila"}'
pageant_id=$(json_field "$evidence_dir/pageant.json" id)

post_json \
  "http://127.0.0.1:8080/admin/platform/pageants/$pageant_id/contestants" \
  "$evidence_dir/contestant.json" \
  "$owner_id" \
  '{"display_name":"Commerce Contestant","country_code":"PH","sash":"COMMERCE","contestant_number":1,"country_representation":"Philippines"}'
pageant_contestant_id=$(json_field "$evidence_dir/contestant.json" id)

invalid_status=$(curl --silent --show-error \
  --output "$evidence_dir/invalid-price.json" \
  --write-out '%{http_code}' \
  --request POST "http://127.0.0.1:8080/admin/platform/organizations/$organization_id/products" \
  --header 'content-type: application/json' \
  --header "x-admin-demo-token: $admin_token" \
  --header "x-crownfi-user-id: $owner_id" \
  --data "{\"kind\":\"collectible\",\"name\":\"Invalid Asset\",\"slug\":\"invalid-asset\",\"status\":\"published\",\"pageant_id\":\"$pageant_id\",\"pageant_contestant_id\":\"$pageant_contestant_id\",\"amount_minor\":1000000,\"asset_code\":\"USDC\",\"asset_scale\":7,\"supply_limit\":1}")
if [[ "$invalid_status" != "400" ]]; then
  echo "Expected a non-XLM asset without an issuer to return 400, got $invalid_status" >&2
  exit 1
fi
printf '%s\n' "$invalid_status" >"$evidence_dir/invalid-price-status.txt"

post_json \
  "http://127.0.0.1:8080/admin/platform/organizations/$organization_id/products" \
  "$evidence_dir/product.json" \
  "$owner_id" \
  "{\"kind\":\"collectible\",\"name\":\"Founders Crown Edition\",\"slug\":\"founders-crown-edition\",\"description\":\"One-of-one Testnet catalogue item.\",\"status\":\"published\",\"pageant_id\":\"$pageant_id\",\"pageant_contestant_id\":\"$pageant_contestant_id\",\"amount_minor\":2500000,\"asset_code\":\"XLM\",\"asset_scale\":7,\"supply_limit\":1}"
product_id=$(json_field "$evidence_dir/product.json" product.id)

post_json \
  "http://127.0.0.1:8080/admin/platform/organizations/$organization_id/collectible-collections" \
  "$evidence_dir/collection.json" \
  "$owner_id" \
  "{\"name\":\"Commerce Contestant Collection\",\"slug\":\"commerce-contestant-collection\",\"description\":\"Persistent collectible collection.\",\"status\":\"published\",\"pageant_id\":\"$pageant_id\",\"pageant_contestant_id\":\"$pageant_contestant_id\",\"metadata_sha256\":\"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\"}"
collection_id=$(json_field "$evidence_dir/collection.json" id)

post_json \
  "http://127.0.0.1:8080/admin/platform/collectible-collections/$collection_id/editions" \
  "$evidence_dir/edition.json" \
  "$owner_id" \
  "{\"product_id\":\"$product_id\",\"edition_number\":1,\"supply_limit\":1,\"mint_policy\":\"on_purchase\",\"metadata_sha256\":\"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb\"}"

curl --fail --silent --show-error \
  "http://127.0.0.1:8080/platform/organizations/$organization_id/products" \
  >"$evidence_dir/products-before-restart.json"
curl --fail --silent --show-error \
  "http://127.0.0.1:8080/platform/products/$product_id" \
  >"$evidence_dir/product-before-restart.json"
curl --fail --silent --show-error \
  "http://127.0.0.1:8080/platform/organizations/$organization_id/collectible-collections" \
  >"$evidence_dir/collections-before-restart.json"
curl --fail --silent --show-error \
  "http://127.0.0.1:8080/platform/collectible-collections/$collection_id/editions" \
  >"$evidence_dir/editions-before-restart.json"

"${compose[@]}" restart api
wait_for_url "http://127.0.0.1:8080/ready"
curl --fail --silent --show-error \
  "http://127.0.0.1:8080/platform/products/$product_id" \
  >"$evidence_dir/product-after-restart.json"
curl --fail --silent --show-error \
  "http://127.0.0.1:8080/platform/collectible-collections/$collection_id/editions" \
  >"$evidence_dir/editions-after-restart.json"

python3 - "$evidence_dir" "$product_id" "$collection_id" <<'PY'
import json
import pathlib
import sys

root = pathlib.Path(sys.argv[1])
product_id, collection_id = sys.argv[2:]

def read(name):
    with (root / name).open(encoding="utf-8") as handle:
        return json.load(handle)

products = read("products-before-restart.json")
assert any(item["id"] == product_id and item["kind"] == "collectible" for item in products)

product = read("product-after-restart.json")
assert product["product"]["id"] == product_id
assert product["product"]["status"] == "published"
assert product["prices"][0]["amount_minor"] == 2500000
assert product["prices"][0]["asset_code"] == "XLM"
assert product["prices"][0]["asset_scale"] == 7
assert product["prices"][0]["asset_issuer"] is None
assert product["inventory"]["supply_limit"] == 1
assert product["inventory"]["reserved_quantity"] == 0
assert product["inventory"]["fulfilled_quantity"] == 0

collections = read("collections-before-restart.json")
assert any(item["id"] == collection_id and item["status"] == "published" for item in collections)

editions = read("editions-after-restart.json")
assert len(editions) == 1
assert editions[0]["collection_id"] == collection_id
assert editions[0]["product_id"] == product_id
assert editions[0]["edition_number"] == 1
assert editions[0]["supply_limit"] == 1
assert editions[0]["mint_policy"] == "on_purchase"
PY

"${compose[@]}" exec -T postgres psql \
  -U "${POSTGRES_USER:-crownfi}" \
  -d "${POSTGRES_DB:-crownfi}" \
  -Atc "SELECT count(*) FROM audit_logs WHERE organization_id = '$organization_id' AND action IN ('product.create', 'collectible_collection.create', 'collectible_edition.create');" \
  | tee "$evidence_dir/audit-count.txt"
if [[ "$(cat "$evidence_dir/audit-count.txt")" != "3" ]]; then
  echo "Expected exactly three commerce audit records" >&2
  exit 1
fi

"${compose[@]}" ps --all | tee "$evidence_dir/compose-ps.txt"
echo "CrownFi commerce catalogue smoke test passed."
