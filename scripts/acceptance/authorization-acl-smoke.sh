#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$repo_root"

env_file="${CROWNFI_AUTHZ_SMOKE_ENV_FILE:-infra/.env.authz-smoke}"
evidence_dir="${CROWNFI_AUTHZ_SMOKE_EVIDENCE_DIR:-.artifacts/acceptance/authorization-acl}"
timeout_seconds="${CROWNFI_AUTHZ_SMOKE_TIMEOUT_SECONDS:-1200}"
admin_token="${CROWNFI_AUTHZ_ADMIN_TOKEN:-local-admin-demo-token}"
web_token="${CROWNFI_AUTHZ_WEB_TOKEN:-local-web-to-api-token-change-before-sharing}"
project_name="${CROWNFI_AUTHZ_SMOKE_PROJECT:-crownfi-authz-${GITHUB_RUN_ID:-local}}"

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
    "${compose[@]}" logs --no-color --tail=700 | tee "$evidence_dir/failure-compose-logs.txt" || true
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

bootstrap() {
  local prefix=$1
  local display_name=$2
  local slug=$3
  curl --fail --silent --show-error \
    --request POST "http://127.0.0.1:8080/admin/platform/bootstrap" \
    --header 'content-type: application/json' \
    --header "x-admin-demo-token: $admin_token" \
    --data "{\"display_name\":\"$display_name\",\"email\":\"$slug@example.test\",\"organization_name\":\"$display_name Organization\",\"organization_slug\":\"$slug\"}" \
    >"$evidence_dir/$prefix-bootstrap.json"
}

admin_pageant_status() {
  local organization_id=$1
  local actor_user_id=$2
  local slug=$3
  local output=$4
  curl --silent --show-error \
    --output "$output" \
    --write-out '%{http_code}' \
    --request POST "http://127.0.0.1:8080/admin/platform/organizations/$organization_id/pageants" \
    --header 'content-type: application/json' \
    --header "x-admin-demo-token: $admin_token" \
    --header "x-crownfi-user-id: $actor_user_id" \
    --data "{\"name\":\"Authorization $slug\",\"slug\":\"$slug\"}"
}

expect_status() {
  local expected=$1
  local actual=$2
  local label=$3
  if [[ "$actual" != "$expected" ]]; then
    echo "$label: expected HTTP $expected, got $actual" >&2
    exit 1
  fi
}

"${compose[@]}" up --build --detach postgres redis db-init api
wait_for_url "http://127.0.0.1:8080/ready"

bootstrap owner "ACL Owner" acl-owner
bootstrap outsider "ACL Outsider" acl-outsider
bootstrap editor "ACL Editor" acl-editor
bootstrap viewer "ACL Viewer" acl-viewer
bootstrap revoked "ACL Revoked" acl-revoked

owner_id=$(json_field "$evidence_dir/owner-bootstrap.json" user.id)
organization_id=$(json_field "$evidence_dir/owner-bootstrap.json" organization.id)
outsider_id=$(json_field "$evidence_dir/outsider-bootstrap.json" user.id)
editor_id=$(json_field "$evidence_dir/editor-bootstrap.json" user.id)
viewer_id=$(json_field "$evidence_dir/viewer-bootstrap.json" user.id)
revoked_id=$(json_field "$evidence_dir/revoked-bootstrap.json" user.id)

"${compose[@]}" exec -T postgres psql \
  -U "${POSTGRES_USER:-crownfi}" \
  -d "${POSTGRES_DB:-crownfi}" \
  -v ON_ERROR_STOP=1 <<SQL
INSERT INTO site_administrators (user_id, role, status, granted_by_user_id)
VALUES ('$owner_id', 'owner', 'active', '$owner_id')
ON CONFLICT (user_id) DO UPDATE SET role = EXCLUDED.role, status = EXCLUDED.status;

INSERT INTO organization_members (organization_id, user_id, role, status, invited_by_user_id)
VALUES
  ('$organization_id', '$editor_id', 'editor', 'active', '$owner_id'),
  ('$organization_id', '$viewer_id', 'viewer', 'active', '$owner_id'),
  ('$organization_id', '$revoked_id', 'editor', 'removed', '$owner_id')
ON CONFLICT (organization_id, user_id) DO UPDATE
SET role = EXCLUDED.role, status = EXCLUDED.status, updated_at = now();
SQL

status=$(admin_pageant_status "$organization_id" "$owner_id" authz-owner "$evidence_dir/owner-pageant.json")
expect_status 201 "$status" "organization owner write"

status=$(admin_pageant_status "$organization_id" "$editor_id" authz-editor "$evidence_dir/editor-pageant.json")
expect_status 201 "$status" "organization editor write"

status=$(admin_pageant_status "$organization_id" "$viewer_id" authz-viewer "$evidence_dir/viewer-denied.json")
expect_status 403 "$status" "same-tenant viewer mutation"

status=$(admin_pageant_status "$organization_id" "$outsider_id" authz-outsider "$evidence_dir/outsider-denied.json")
expect_status 404 "$status" "cross-tenant mutation concealment"

status=$(admin_pageant_status "$organization_id" "$revoked_id" authz-revoked "$evidence_dir/revoked-denied.json")
expect_status 404 "$status" "revoked membership mutation"

spoof_status=$(curl --silent --show-error \
  --output "$evidence_dir/actor-spoof-denied.json" \
  --write-out '%{http_code}' \
  --request POST "http://127.0.0.1:8080/internal/manage/pageants" \
  --header 'content-type: application/json' \
  --header "x-crownfi-web-token: $web_token" \
  --header "x-crownfi-user-id: $editor_id" \
  --data "{\"actor_user_id\":\"$owner_id\",\"organization_id\":\"$organization_id\",\"name\":\"Spoofed Pageant\",\"slug\":\"spoofed-pageant\"}")
expect_status 403 "$spoof_status" "body/header actor spoof"

correct_internal_status=$(curl --silent --show-error \
  --output "$evidence_dir/internal-editor-pageant.json" \
  --write-out '%{http_code}' \
  --request POST "http://127.0.0.1:8080/internal/manage/pageants" \
  --header 'content-type: application/json' \
  --header "x-crownfi-web-token: $web_token" \
  --header "x-crownfi-user-id: $editor_id" \
  --data "{\"actor_user_id\":\"$editor_id\",\"organization_id\":\"$organization_id\",\"name\":\"Internal Editor Pageant\",\"slug\":\"internal-editor-pageant\"}")
expect_status 201 "$correct_internal_status" "bound internal editor write"

site_owner_status=$(curl --silent --show-error \
  --output "$evidence_dir/site-settings-owner.json" \
  --write-out '%{http_code}' \
  --header "x-crownfi-web-token: $web_token" \
  --header "x-crownfi-user-id: $owner_id" \
  "http://127.0.0.1:8080/internal/site-settings")
expect_status 200 "$site_owner_status" "site owner settings read"

site_editor_status=$(curl --silent --show-error \
  --output "$evidence_dir/site-settings-editor-denied.json" \
  --write-out '%{http_code}' \
  --header "x-crownfi-web-token: $web_token" \
  --header "x-crownfi-user-id: $editor_id" \
  "http://127.0.0.1:8080/internal/site-settings")
expect_status 403 "$site_editor_status" "organizer settings read denial"

missing_actor_status=$(curl --silent --show-error \
  --output "$evidence_dir/missing-actor-denied.json" \
  --write-out '%{http_code}' \
  --header "x-crownfi-web-token: $web_token" \
  "http://127.0.0.1:8080/internal/site-settings")
expect_status 401 "$missing_actor_status" "missing actor denial"

"${compose[@]}" restart api
wait_for_url "http://127.0.0.1:8080/ready"

restart_status=$(admin_pageant_status "$organization_id" "$outsider_id" authz-restart-outsider "$evidence_dir/restart-outsider-denied.json")
expect_status 404 "$restart_status" "cross-tenant denial after restart"

"${compose[@]}" exec -T postgres psql \
  -U "${POSTGRES_USER:-crownfi}" \
  -d "${POSTGRES_DB:-crownfi}" \
  -Atc "SELECT decision || ':' || count(*) FROM authorization_decisions GROUP BY decision ORDER BY decision;" \
  | tee "$evidence_dir/authorization-decision-counts.txt"

grep -q '^allow:' "$evidence_dir/authorization-decision-counts.txt"
grep -q '^deny:' "$evidence_dir/authorization-decision-counts.txt"

"${compose[@]}" exec -T postgres psql \
  -U "${POSTGRES_USER:-crownfi}" \
  -d "${POSTGRES_DB:-crownfi}" \
  -Atc "SELECT count(*) FROM authorization_decisions WHERE organization_id = '$organization_id' AND capability = 'pageant.write' AND decision = 'deny';" \
  | tee "$evidence_dir/pageant-denial-count.txt"
if (( $(cat "$evidence_dir/pageant-denial-count.txt") < 3 )); then
  echo "Expected durable pageant authorization denial evidence" >&2
  exit 1
fi

"${compose[@]}" ps --all | tee "$evidence_dir/compose-ps.txt"
echo "CrownFi authorization ACL smoke test passed."
