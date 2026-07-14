#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$repo_root"

env_file="${CROWNFI_ORGANIZER_WEB_SMOKE_ENV_FILE:-infra/.env.organizer-web-smoke}"
evidence_dir="${CROWNFI_ORGANIZER_WEB_SMOKE_EVIDENCE_DIR:-.artifacts/acceptance/organizer-web}"
timeout_seconds="${CROWNFI_ORGANIZER_WEB_SMOKE_TIMEOUT_SECONDS:-1500}"
project_name="${CROWNFI_ORGANIZER_WEB_SMOKE_PROJECT:-crownfi-organizer-web-${GITHUB_RUN_ID:-local}}"
demo_user_id="c10f1000-0000-0000-0000-000000000001"
demo_organization_id="c10f1000-0000-0000-0000-000000000010"
pageant_name="Organizer Review Pageant 2026"
pageant_slug="organizer-review-pageant-2026"
contestant_name="Review Console Contestant"
section_title="Review Console Advocacy"
section_body="Created through the server-only organizer review workflow."

for command in docker curl grep python3; do
  command -v "$command" >/dev/null 2>&1 || {
    echo "Required command not found: $command" >&2
    exit 1
  }
done
docker compose version >/dev/null

if [[ ! -f "$env_file" ]]; then
  cp infra/.env.example "$env_file"
fi
set -a
# shellcheck disable=SC1090
source "$env_file"
set +a
export CROWNFI_ORGANIZER_REVIEW_ENABLED=true
export CROWNFI_ORGANIZER_ACTOR_USER_ID="$demo_user_id"

mkdir -p "$evidence_dir"
compose=(docker compose --project-name "$project_name" --env-file "$env_file" -f infra/docker-compose.yml)

cleanup() {
  local status=$?
  if [[ $status -ne 0 ]]; then
    "${compose[@]}" ps --all | tee "$evidence_dir/failure-compose-ps.txt" || true
    "${compose[@]}" logs --no-color --tail=600 | tee "$evidence_dir/failure-compose-logs.txt" || true
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

assert_contains() {
  local file=$1
  local expected=$2
  if ! grep -Fq "$expected" "$file"; then
    echo "Expected '$expected' in $file" >&2
    return 1
  fi
}

post_form() {
  curl --fail --silent --show-error \
    --request POST \
    --output /dev/null \
    "$@"
}

"${compose[@]}" up --build --detach postgres redis db-init legacy-db-init api web
wait_for_url "http://127.0.0.1:8080/ready"
wait_for_url "http://127.0.0.1:3000/api/health"
wait_for_url "http://127.0.0.1:3000/organizer/review"

"${compose[@]}" run --rm \
  -e CROWNFI_ALLOW_DEMO_SEED=true \
  -e CROWNFI_API_MODE=local \
  api crownfi-api seed demo \
  | tee "$evidence_dir/seed-output.txt"

curl --fail --silent --show-error "http://127.0.0.1:3000/organizer/review" \
  >"$evidence_dir/organizer-console.html"
assert_contains "$evidence_dir/organizer-console.html" "Milestone B review console"
assert_contains "$evidence_dir/organizer-console.html" "$demo_user_id"
assert_contains "$evidence_dir/organizer-console.html" "CrownFi Demo Organization"

post_form "http://127.0.0.1:3000/api/organizer/review" \
  --data-urlencode "intent=pageant" \
  --data-urlencode "organization_id=$demo_organization_id" \
  --data-urlencode "name=$pageant_name" \
  --data-urlencode "slug=$pageant_slug" \
  --data-urlencode "description=Created by the organizer web smoke test." \
  --data-urlencode "timezone=Asia/Manila" \
  --data-urlencode "venue_name=Review Stage"

curl --fail --silent --show-error \
  "http://127.0.0.1:8080/platform/organizations/$demo_organization_id/pageants" \
  >"$evidence_dir/pageants.json"
pageant_id=$(python3 - "$evidence_dir/pageants.json" "$pageant_name" <<'PY'
import json
import pathlib
import sys
items = json.loads(pathlib.Path(sys.argv[1]).read_text(encoding="utf-8"))
name = sys.argv[2]
for item in items:
    if item.get("name") == name:
        print(item["id"])
        break
else:
    raise SystemExit(f"Pageant {name!r} not found")
PY
)

post_form "http://127.0.0.1:3000/api/organizer/review" \
  --data-urlencode "intent=category" \
  --data-urlencode "pageant_id=$pageant_id" \
  --data-urlencode "name=Community Choice" \
  --data-urlencode "slug=community-choice" \
  --data-urlencode "description=Created through the organizer console." \
  --data-urlencode "sort_order=2"

post_form "http://127.0.0.1:3000/api/organizer/review" \
  --data-urlencode "intent=contestant" \
  --data-urlencode "pageant_id=$pageant_id" \
  --data-urlencode "display_name=$contestant_name" \
  --data-urlencode "biography=Persistent contestant created without editing source code." \
  --data-urlencode "country_code=PH" \
  --data-urlencode "country_representation=Philippines" \
  --data-urlencode "sash=REVIEW" \
  --data-urlencode "contestant_number=7" \
  --data-urlencode "sort_order=1"

curl --fail --silent --show-error \
  "http://127.0.0.1:8080/platform/pageants/$pageant_id/contestants" \
  >"$evidence_dir/contestants.json"
contestant_id=$(python3 - "$evidence_dir/contestants.json" "$contestant_name" <<'PY'
import json
import pathlib
import sys
items = json.loads(pathlib.Path(sys.argv[1]).read_text(encoding="utf-8"))
name = sys.argv[2]
for item in items:
    if item.get("display_name") == name:
        print(item["id"])
        break
else:
    raise SystemExit(f"Contestant {name!r} not found")
PY
)

post_form "http://127.0.0.1:3000/api/organizer/review" \
  --data-urlencode "intent=section" \
  --data-urlencode "pageant_contestant_id=$contestant_id" \
  --data-urlencode "kind=advocacy" \
  --data-urlencode "title=$section_title" \
  --data-urlencode "slug=review-console-advocacy" \
  --data-urlencode "sort_order=1" \
  --data-urlencode "is_visible=on" \
  --data-urlencode "body=$section_body"

curl --fail --silent --show-error \
  "http://127.0.0.1:3000/platform/pageants/$pageant_id" \
  >"$evidence_dir/pageant.html"
curl --fail --silent --show-error \
  "http://127.0.0.1:3000/platform/pageants/$pageant_id/contestants/$contestant_id" \
  >"$evidence_dir/contestant.html"
assert_contains "$evidence_dir/pageant.html" "$pageant_name"
assert_contains "$evidence_dir/pageant.html" "Community Choice"
assert_contains "$evidence_dir/pageant.html" "$contestant_name"
assert_contains "$evidence_dir/contestant.html" "$section_title"
assert_contains "$evidence_dir/contestant.html" "$section_body"

audit_count=$("${compose[@]}" exec -T postgres \
  psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atc \
  "SELECT count(*) FROM audit_logs WHERE organization_id = '$demo_organization_id' AND action IN ('pageant.create', 'category.create', 'contestant.add_to_pageant', 'contestant_section.create');")
if [[ "$audit_count" -lt 4 ]]; then
  echo "Expected at least four organizer audit records, found $audit_count" >&2
  exit 1
fi
printf '%s\n' "$audit_count" >"$evidence_dir/audit-count.txt"

"${compose[@]}" restart api
wait_for_url "http://127.0.0.1:8080/ready"
curl --fail --silent --show-error \
  "http://127.0.0.1:3000/platform/pageants/$pageant_id/contestants/$contestant_id" \
  >"$evidence_dir/contestant-after-api-restart.html"
assert_contains "$evidence_dir/contestant-after-api-restart.html" "$section_body"

"${compose[@]}" ps --all | tee "$evidence_dir/compose-ps.txt"
echo "CrownFi organizer web smoke test passed."
