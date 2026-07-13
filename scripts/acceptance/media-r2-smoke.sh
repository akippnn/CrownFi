#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$repo_root"

env_file="${CROWNFI_MEDIA_SMOKE_ENV_FILE:-infra/.env.media-smoke}"
evidence_dir="${CROWNFI_MEDIA_SMOKE_EVIDENCE_DIR:-.artifacts/acceptance/media-r2}"
timeout_seconds="${CROWNFI_MEDIA_SMOKE_TIMEOUT_SECONDS:-900}"
admin_token="${CROWNFI_MEDIA_ADMIN_TOKEN:-local-admin-demo-token}"
project_name="${CROWNFI_MEDIA_SMOKE_PROJECT:-crownfi-media-${GITHUB_RUN_ID:-local}}"

for command in docker curl python3 sha256sum; do
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
compose=(
  docker compose
  --project-name "$project_name"
  --env-file "$env_file"
  -f infra/docker-compose.yml
  -f infra/docker-compose.media-test.yml
)

cleanup() {
  local status=$?
  if [[ $status -ne 0 ]]; then
    "${compose[@]}" ps --all | tee "$evidence_dir/failure-compose-ps.txt" || true
    "${compose[@]}" logs --no-color --tail=400 | tee "$evidence_dir/failure-compose-logs.txt" || true
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

with open(sys.argv[1], encoding="utf-8") as handle:
    value = json.load(handle)
for part in sys.argv[2].split("."):
    value = value[part]
print(value)
PY
}

post_json() {
  local url=$1
  local output=$2
  local body=$3
  shift 3
  curl --fail --silent --show-error \
    --request POST "$url" \
    --header 'content-type: application/json' \
    --header "x-admin-demo-token: $admin_token" \
    "$@" \
    --data "$body" >"$output"
}

upload_from_intent() {
  local intent_file=$1
  local input_file=$2
  local upload_url
  local content_type
  local declared_hash
  upload_url=$(json_field "$intent_file" upload.url)
  content_type=$(json_field "$intent_file" upload.headers.content-type)
  declared_hash=$(json_field "$intent_file" upload.headers.x-amz-meta-sha256)
  cat "$input_file" | "${compose[@]}" exec -T api \
    curl --fail --silent --show-error \
      --request PUT "$upload_url" \
      --header "content-type: $content_type" \
      --header "x-amz-meta-sha256: $declared_hash" \
      --data-binary @-
}

create_upload_intent() {
  local organization_id=$1
  local actor_user_id=$2
  local input_file=$3
  local visibility=$4
  local output=$5
  local hash
  local size
  hash=$(sha256sum "$input_file" | awk '{print $1}')
  size=$(wc -c <"$input_file" | tr -d '[:space:]')
  local body
  body=$(python3 - "$size" "$hash" "$visibility" <<'PY'
import json
import sys

size, digest, visibility = sys.argv[1:]
print(json.dumps({
    "original_filename": "smoke.png",
    "content_type": "image/png",
    "byte_size": int(size),
    "sha256": digest,
    "visibility": visibility,
    "alt_text": "CrownFi media smoke test",
}))
PY
)
  post_json \
    "http://127.0.0.1:8080/admin/platform/organizations/$organization_id/media/upload-intents" \
    "$output" \
    "$body" \
    --header "x-crownfi-user-id: $actor_user_id"
}

create_platform_owner() {
  local prefix=$1
  local output=$2
  post_json \
    "http://127.0.0.1:8080/admin/platform/bootstrap" \
    "$output" \
    "{\"display_name\":\"$prefix Owner\",\"email\":\"${prefix,,}@example.test\",\"organization_name\":\"$prefix Organization\",\"organization_slug\":\"${prefix,,}-organization\"}"
}

create_pageant_contestant() {
  local prefix=$1
  local user_id=$2
  local organization_id=$3
  local output=$4
  local pageant_file="$evidence_dir/${prefix,,}-pageant.json"
  post_json \
    "http://127.0.0.1:8080/admin/platform/organizations/$organization_id/pageants" \
    "$pageant_file" \
    "{\"name\":\"$prefix Pageant\",\"slug\":\"${prefix,,}-pageant\"}" \
    --header "x-crownfi-user-id: $user_id"
  local pageant_id
  pageant_id=$(json_field "$pageant_file" id)
  post_json \
    "http://127.0.0.1:8080/admin/platform/pageants/$pageant_id/contestants" \
    "$output" \
    "{\"display_name\":\"$prefix Contestant\",\"country_code\":\"PH\",\"sash\":\"$prefix\",\"contestant_number\":1}" \
    --header "x-crownfi-user-id: $user_id"
}

python3 - "$evidence_dir" <<'PY'
import base64
import pathlib
import sys

root = pathlib.Path(sys.argv[1])
# Valid 1x1 PNG. A same-length mutation is used to prove the server hashes bytes.
data = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z6CkAAAAASUVORK5CYII="
)
(root / "image.png").write_bytes(data)
mutated = bytearray(data)
mutated[-13] ^= 0x01
(root / "image-mutated.png").write_bytes(mutated)
PY

"${compose[@]}" up --build --detach postgres redis db-init minio minio-init api
wait_for_url "http://127.0.0.1:8080/ready"
curl --fail --silent --show-error http://127.0.0.1:8080/ready >"$evidence_dir/ready.json"

create_platform_owner Primary "$evidence_dir/primary-owner.json"
primary_user_id=$(json_field "$evidence_dir/primary-owner.json" user.id)
primary_organization_id=$(json_field "$evidence_dir/primary-owner.json" organization.id)
create_pageant_contestant Primary "$primary_user_id" "$primary_organization_id" "$evidence_dir/primary-contestant.json"
primary_contestant_id=$(json_field "$evidence_dir/primary-contestant.json" id)

create_upload_intent \
  "$primary_organization_id" "$primary_user_id" "$evidence_dir/image.png" public \
  "$evidence_dir/public-intent.json"
public_asset_id=$(json_field "$evidence_dir/public-intent.json" asset.id)
upload_from_intent "$evidence_dir/public-intent.json" "$evidence_dir/image.png"
post_json \
  "http://127.0.0.1:8080/admin/platform/media/$public_asset_id/complete" \
  "$evidence_dir/public-complete.json" \
  '{"width":1,"height":1}' \
  --header "x-crownfi-user-id: $primary_user_id"
post_json \
  "http://127.0.0.1:8080/admin/platform/pageant-contestants/$primary_contestant_id/media" \
  "$evidence_dir/public-attachment.json" \
  "{\"media_asset_id\":\"$public_asset_id\",\"role\":\"portrait\",\"sort_order\":1}" \
  --header "x-crownfi-user-id: $primary_user_id"
curl --fail --silent --show-error \
  "http://127.0.0.1:8080/platform/media/$public_asset_id" \
  >"$evidence_dir/public-read.json"

create_upload_intent \
  "$primary_organization_id" "$primary_user_id" "$evidence_dir/image.png" private \
  "$evidence_dir/private-intent.json"
private_asset_id=$(json_field "$evidence_dir/private-intent.json" asset.id)
upload_from_intent "$evidence_dir/private-intent.json" "$evidence_dir/image.png"
post_json \
  "http://127.0.0.1:8080/admin/platform/media/$private_asset_id/complete" \
  "$evidence_dir/private-complete.json" \
  '{"width":1,"height":1}' \
  --header "x-crownfi-user-id: $primary_user_id"
private_status=$(curl --silent --show-error \
  --output "$evidence_dir/private-public-read.json" \
  --write-out '%{http_code}' \
  "http://127.0.0.1:8080/platform/media/$private_asset_id")
test "$private_status" = "404"
printf '%s\n' "$private_status" >"$evidence_dir/private-public-status.txt"

create_upload_intent \
  "$primary_organization_id" "$primary_user_id" "$evidence_dir/image.png" public \
  "$evidence_dir/mismatch-intent.json"
mismatch_asset_id=$(json_field "$evidence_dir/mismatch-intent.json" asset.id)
upload_from_intent "$evidence_dir/mismatch-intent.json" "$evidence_dir/image-mutated.png"
mismatch_status=$(curl --silent --show-error \
  --output "$evidence_dir/mismatch-complete.json" \
  --write-out '%{http_code}' \
  --request POST "http://127.0.0.1:8080/admin/platform/media/$mismatch_asset_id/complete" \
  --header 'content-type: application/json' \
  --header "x-admin-demo-token: $admin_token" \
  --header "x-crownfi-user-id: $primary_user_id" \
  --data '{"width":1,"height":1}')
test "$mismatch_status" = "409"
printf '%s\n' "$mismatch_status" >"$evidence_dir/mismatch-status.txt"

create_platform_owner Outside "$evidence_dir/outside-owner.json"
outside_user_id=$(json_field "$evidence_dir/outside-owner.json" user.id)
outside_organization_id=$(json_field "$evidence_dir/outside-owner.json" organization.id)
create_pageant_contestant Outside "$outside_user_id" "$outside_organization_id" "$evidence_dir/outside-contestant.json"
outside_contestant_id=$(json_field "$evidence_dir/outside-contestant.json" id)
cross_org_status=$(curl --silent --show-error \
  --output "$evidence_dir/cross-organization-attach.json" \
  --write-out '%{http_code}' \
  --request POST "http://127.0.0.1:8080/admin/platform/pageant-contestants/$outside_contestant_id/media" \
  --header 'content-type: application/json' \
  --header "x-admin-demo-token: $admin_token" \
  --header "x-crownfi-user-id: $outside_user_id" \
  --data "{\"media_asset_id\":\"$public_asset_id\",\"role\":\"portrait\"}")
test "$cross_org_status" = "403"
printf '%s\n' "$cross_org_status" >"$evidence_dir/cross-organization-status.txt"

"${compose[@]}" restart api
wait_for_url "http://127.0.0.1:8080/ready"
curl --fail --silent --show-error \
  "http://127.0.0.1:8080/platform/pageant-contestants/$primary_contestant_id/media" \
  >"$evidence_dir/media-after-restart.json"

python3 - "$evidence_dir" "$public_asset_id" <<'PY'
import json
import pathlib
import sys

root = pathlib.Path(sys.argv[1])
asset_id = sys.argv[2]
with (root / "public-complete.json").open(encoding="utf-8") as handle:
    completed = json.load(handle)
assert completed["status"] == "ready"
assert completed["sha256"]
assert completed["delivery_url"]
with (root / "media-after-restart.json").open(encoding="utf-8") as handle:
    attached = json.load(handle)
assert any(item["asset"]["id"] == asset_id and item["role"] == "portrait" for item in attached)
PY

"${compose[@]}" exec -T postgres psql \
  -U "${POSTGRES_USER:-crownfi}" -d "${POSTGRES_DB:-crownfi}" -Atc \
  "SELECT status FROM media_assets WHERE id = '$mismatch_asset_id';" \
  | tee "$evidence_dir/mismatch-database-status.txt"
grep -qx failed "$evidence_dir/mismatch-database-status.txt"
"${compose[@]}" ps --all | tee "$evidence_dir/compose-ps.txt"

echo "CrownFi R2-compatible media smoke test passed."
