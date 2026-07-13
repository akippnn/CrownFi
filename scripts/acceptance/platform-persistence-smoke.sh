#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$repo_root"

env_file="${CROWNFI_PLATFORM_SMOKE_ENV_FILE:-infra/.env.platform-smoke}"
evidence_dir="${CROWNFI_PLATFORM_SMOKE_EVIDENCE_DIR:-.artifacts/acceptance/platform-persistence}"
timeout_seconds="${CROWNFI_PLATFORM_SMOKE_TIMEOUT_SECONDS:-600}"
admin_token="${CROWNFI_PLATFORM_ADMIN_TOKEN:-local-admin-demo-token}"
project_name="${CROWNFI_PLATFORM_SMOKE_PROJECT:-crownfi-platform-persistence-${GITHUB_RUN_ID:-local}}"

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Required command not found: $1" >&2
    exit 1
  fi
}

require_command docker
require_command curl
require_command python3
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
    "${compose[@]}" logs --no-color --tail=300 | tee "$evidence_dir/failure-compose-logs.txt" || true
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
  local body=$3
  shift 3
  curl --fail --silent --show-error \
    --request POST "$url" \
    --header 'content-type: application/json' \
    --header "x-admin-demo-token: $admin_token" \
    "$@" \
    --data "$body" >"$output"
}

"${compose[@]}" up --build --detach postgres redis db-init api
wait_for_url "http://127.0.0.1:8080/ready"
curl --fail --silent --show-error "http://127.0.0.1:8080/ready" >"$evidence_dir/ready-before.json"

post_json \
  "http://127.0.0.1:8080/admin/platform/bootstrap" \
  "$evidence_dir/bootstrap-owner.json" \
  '{"display_name":"Milestone B Owner","email":"owner@example.test","organization_name":"CrownFi Smoke Organization","organization_slug":"crownfi-smoke"}'

owner_id=$(json_field "$evidence_dir/bootstrap-owner.json" user.id)
organization_id=$(json_field "$evidence_dir/bootstrap-owner.json" organization.id)
actor_header=(--header "x-crownfi-user-id: $owner_id")

post_json \
  "http://127.0.0.1:8080/admin/platform/organizations/$organization_id/pageants" \
  "$evidence_dir/pageant.json" \
  '{"name":"CrownFi Persistence Pageant","slug":"persistence-pageant","description":"Milestone B persistence smoke test","timezone":"Asia/Manila","venue_name":"Smoke Test Stage"}' \
  "${actor_header[@]}"
pageant_id=$(json_field "$evidence_dir/pageant.json" id)

post_json \
  "http://127.0.0.1:8080/admin/platform/pageants/$pageant_id/categories" \
  "$evidence_dir/category.json" \
  '{"name":"Fan Choice","slug":"fan-choice","description":"Smoke category","sort_order":1}' \
  "${actor_header[@]}"

post_json \
  "http://127.0.0.1:8080/admin/platform/pageants/$pageant_id/contestants" \
  "$evidence_dir/contestant.json" \
  '{"display_name":"Smoke Contestant","country_code":"PH","sash":"PHILIPPINES","contestant_number":1,"country_representation":"Philippines","sort_order":1}' \
  "${actor_header[@]}"
pageant_contestant_id=$(json_field "$evidence_dir/contestant.json" id)

post_json \
  "http://127.0.0.1:8080/admin/platform/pageant-contestants/$pageant_contestant_id/sections" \
  "$evidence_dir/section.json" \
  '{"kind":"overview","title":"Overview","slug":"overview","sort_order":1,"is_visible":true,"settings_json":{"layout":"hero"}}' \
  "${actor_header[@]}"

post_json \
  "http://127.0.0.1:8080/admin/platform/bootstrap" \
  "$evidence_dir/bootstrap-outsider.json" \
  '{"display_name":"Outside Editor","email":"outsider@example.test","organization_name":"Outside Organization","organization_slug":"outside-organization"}'
outsider_id=$(json_field "$evidence_dir/bootstrap-outsider.json" user.id)

outsider_status=$(curl --silent --show-error \
  --output "$evidence_dir/outsider-denial.json" \
  --write-out '%{http_code}' \
  --request POST "http://127.0.0.1:8080/admin/platform/organizations/$organization_id/pageants" \
  --header 'content-type: application/json' \
  --header "x-admin-demo-token: $admin_token" \
  --header "x-crownfi-user-id: $outsider_id" \
  --data '{"name":"Forbidden Pageant","slug":"forbidden-pageant"}')
if [[ "$outsider_status" != "403" ]]; then
  echo "Expected outsider mutation to return 403, got $outsider_status" >&2
  exit 1
fi
printf '%s\n' "$outsider_status" >"$evidence_dir/outsider-status.txt"

"${compose[@]}" restart api
wait_for_url "http://127.0.0.1:8080/ready"
curl --fail --silent --show-error "http://127.0.0.1:8080/ready" >"$evidence_dir/ready-after-restart.json"
curl --fail --silent --show-error \
  "http://127.0.0.1:8080/platform/organizations/$organization_id/pageants" \
  >"$evidence_dir/pageants-after-restart.json"
curl --fail --silent --show-error \
  "http://127.0.0.1:8080/platform/pageants/$pageant_id/contestants" \
  >"$evidence_dir/contestants-after-restart.json"
curl --fail --silent --show-error \
  "http://127.0.0.1:8080/platform/pageant-contestants/$pageant_contestant_id/sections" \
  >"$evidence_dir/sections-after-restart.json"\npython3 - "$evidence_dir" "$organization_id" "$pageant_id" "$pageant_contestant_id" <<'PY'
import json
import pathlib
import sys

root = pathlib.Path(sys.argv[1])
organization_id, pageant_id, pageant_contestant_id = sys.argv[2:]

with (root / "ready-after-restart.json").open(encoding="utf-8") as handle:
    ready = json.load(handle)
assert ready["ok"] is True
assert ready["database_reachable"] is True

with (root / "pageants-after-restart.json").open(encoding="utf-8") as handle:
    pageants = json.load(handle)
assert any(item["id"] == pageant_id and item["organization_id"] == organization_id for item in pageants)

with (root / "contestants-after-restart.json").open(encoding="utf-8") as handle:
    contestants = json.load(handle)
assert any(item["id"] == pageant_contestant_id for item in contestants)

with (root / "sections-after-restart.json").open(encoding="utf-8") as handle:
    sections = json.load(handle)
assert any(item["slug"] == "overview" and item["settings_json"]["layout"] == "hero" for item in sections)
PY

"${compose[@]}" exec -T postgres psql \
  -U "${POSTGRES_USER:-crownfi}" \
  -d "${POSTGRES_DB:-crownfi}" \
  -Atc "SELECT count(*) FROM organization_members WHERE organization_id = '$organization_id' AND user_id = '$owner_id' AND role = 'owner' AND status = 'active';" \
  | tee "$evidence_dir/owner-membership-count.txt"
"${compose[@]}" exec -T postgres psql \
  -U "${POSTGRES_USER:-crownfi}" \
  -d "${POSTGRES_DB:-crownfi}" \
  -Atc "SELECT count(*) FROM audit_logs WHERE organization_id = '$organization_id';" \
  | tee "$evidence_dir/audit-count.txt"

if ! grep -qx '1' "$evidence_dir/owner-membership-count.txt"; then
  echo "Owner membership was not created atomically" >&2
  exit 1
fi
if (( $(cat "$evidence_dir/audit-count.txt") < 5 )); then
  echo "Expected at least five audit records for the primary organization" >&2
  exit 1
fi

"${compose[@]}" ps --all | tee "$evidence_dir/compose-ps.txt"
echo "CrownFi platform persistence smoke test passed."
