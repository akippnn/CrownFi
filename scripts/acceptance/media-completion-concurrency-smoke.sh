#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$repo_root"

env_file="${CROWNFI_MEDIA_CONCURRENCY_ENV_FILE:-infra/.env.media-concurrency-smoke}"
evidence_dir="${CROWNFI_MEDIA_CONCURRENCY_EVIDENCE_DIR:-.artifacts/acceptance/media-completion-concurrency}"
timeout_seconds="${CROWNFI_MEDIA_CONCURRENCY_TIMEOUT_SECONDS:-900}"
admin_token="${CROWNFI_MEDIA_ADMIN_TOKEN:-local-admin-demo-token}"
project_name="${CROWNFI_MEDIA_CONCURRENCY_PROJECT:-crownfi-media-concurrency-${GITHUB_RUN_ID:-local}}"

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

python3 - "$evidence_dir/concurrent-image.png" <<'PY'
import base64
import pathlib
import sys

path = pathlib.Path(sys.argv[1])
seed = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z6CkAAAAASUVORK5CYII="
)
size = 512 * 1024
data = (seed * ((size // len(seed)) + 1))[:size]
path.write_bytes(data)
PY

"${compose[@]}" up --build --detach postgres redis db-init minio minio-init api
wait_for_url "http://127.0.0.1:8080/ready"
curl --fail --silent --show-error http://127.0.0.1:8080/ready >"$evidence_dir/ready.json"

post_json \
  "http://127.0.0.1:8080/admin/platform/bootstrap" \
  "$evidence_dir/owner.json" \
  '{"display_name":"Concurrency Owner","email":"concurrency@example.test","organization_name":"Concurrency Organization","organization_slug":"concurrency-organization"}'
user_id=$(json_field "$evidence_dir/owner.json" user.id)
organization_id=$(json_field "$evidence_dir/owner.json" organization.id)

image_file="$evidence_dir/concurrent-image.png"
image_hash=$(sha256sum "$image_file" | awk '{print $1}')
image_size=$(wc -c <"$image_file" | tr -d '[:space:]')
intent_body=$(python3 - "$image_size" "$image_hash" <<'PY'
import json
import sys

size, digest = sys.argv[1:]
print(json.dumps({
    "original_filename": "concurrent-image.png",
    "content_type": "image/png",
    "byte_size": int(size),
    "sha256": digest,
    "visibility": "public",
    "alt_text": "Concurrent completion regression fixture",
}))
PY
)
post_json \
  "http://127.0.0.1:8080/admin/platform/organizations/$organization_id/media/upload-intents" \
  "$evidence_dir/intent.json" \
  "$intent_body" \
  --header "x-crownfi-user-id: $user_id"
asset_id=$(json_field "$evidence_dir/intent.json" asset.id)
upload_url=$(json_field "$evidence_dir/intent.json" upload.url)
content_type=$(json_field "$evidence_dir/intent.json" upload.headers.content-type)
declared_hash=$(json_field "$evidence_dir/intent.json" upload.headers.x-amz-meta-sha256)
cat "$image_file" | "${compose[@]}" exec -T api \
  curl --fail --silent --show-error \
    --request PUT "$upload_url" \
    --header "content-type: $content_type" \
    --header "x-amz-meta-sha256: $declared_hash" \
    --data-binary @-

completion_pids=()
for attempt in {1..8}; do
  (
    curl --silent --show-error \
      --output "$evidence_dir/complete-$attempt.json" \
      --write-out '%{http_code}' \
      --request POST "http://127.0.0.1:8080/admin/platform/media/$asset_id/complete" \
      --header 'content-type: application/json' \
      --header "x-admin-demo-token: $admin_token" \
      --header "x-crownfi-user-id: $user_id" \
      --data '{"width":1,"height":1}' \
      >"$evidence_dir/complete-$attempt-status.txt"
  ) &
  completion_pids+=("$!")
done
for pid in "${completion_pids[@]}"; do
  wait "$pid"
done

for attempt in {1..8}; do
  grep -qx 200 "$evidence_dir/complete-$attempt-status.txt"
done
python3 - "$evidence_dir" "$asset_id" <<'PY'
import json
import pathlib
import sys

root = pathlib.Path(sys.argv[1])
asset_id = sys.argv[2]
for attempt in range(1, 9):
    with (root / f"complete-{attempt}.json").open(encoding="utf-8") as handle:
        response = json.load(handle)
    assert response["id"] == asset_id
    assert response["status"] == "ready"
PY

"${compose[@]}" exec -T postgres psql \
  -U "${POSTGRES_USER:-crownfi}" -d "${POSTGRES_DB:-crownfi}" -Atc \
  "SELECT count(*) FROM audit_logs WHERE action = 'media.upload.complete' AND entity_id = '$asset_id';" \
  | tee "$evidence_dir/completion-audit-count.txt"
grep -qx 1 "$evidence_dir/completion-audit-count.txt"

"${compose[@]}" exec -T postgres psql \
  -U "${POSTGRES_USER:-crownfi}" -d "${POSTGRES_DB:-crownfi}" -Atc \
  "SELECT status FROM media_assets WHERE id = '$asset_id';" \
  | tee "$evidence_dir/media-status.txt"
grep -qx ready "$evidence_dir/media-status.txt"

"${compose[@]}" ps --all | tee "$evidence_dir/compose-ps.txt"
echo "CrownFi media completion concurrency smoke test passed."
