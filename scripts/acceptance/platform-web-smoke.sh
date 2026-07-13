#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$repo_root"

env_file="${CROWNFI_PLATFORM_WEB_SMOKE_ENV_FILE:-infra/.env.platform-web-smoke}"
evidence_dir="${CROWNFI_PLATFORM_WEB_SMOKE_EVIDENCE_DIR:-.artifacts/acceptance/platform-web}"
timeout_seconds="${CROWNFI_PLATFORM_WEB_SMOKE_TIMEOUT_SECONDS:-1200}"
project_name="${CROWNFI_PLATFORM_WEB_SMOKE_PROJECT:-crownfi-platform-web-${GITHUB_RUN_ID:-local}}"
pageant_id="c10f1000-0000-0000-0000-000000000100"
contestant_id="c10f1000-0000-0000-0000-000000011001"

for command in docker curl grep; do
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

assert_contains() {
  local file=$1
  local expected=$2
  if ! grep -Fq "$expected" "$file"; then
    echo "Expected '$expected' in $file" >&2
    return 1
  fi
}

"${compose[@]}" up --build --detach postgres redis db-init legacy-db-init api web
wait_for_url "http://127.0.0.1:8080/ready"
wait_for_url "http://127.0.0.1:3000/api/health"
wait_for_url "http://127.0.0.1:3000/platform"

curl --fail --silent --show-error "http://127.0.0.1:3000/platform" \
  >"$evidence_dir/platform-empty.html"
assert_contains "$evidence_dir/platform-empty.html" "No platform pageants yet"

"${compose[@]}" run --rm \
  -e CROWNFI_ALLOW_DEMO_SEED=true \
  -e CROWNFI_API_MODE=local \
  api crownfi-api seed demo \
  | tee "$evidence_dir/seed-output.txt"

curl --fail --silent --show-error "http://127.0.0.1:3000/platform" \
  >"$evidence_dir/platform-seeded.html"
curl --fail --silent --show-error "http://127.0.0.1:3000/platform/pageants/$pageant_id" \
  >"$evidence_dir/pageant.html"
curl --fail --silent --show-error \
  "http://127.0.0.1:3000/platform/pageants/$pageant_id/contestants/$contestant_id" \
  >"$evidence_dir/contestant.html"\nassert_contains "$evidence_dir/platform-seeded.html" "CrownFi International 2026"
assert_contains "$evidence_dir/pageant.html" "Ariella Santos"
assert_contains "$evidence_dir/pageant.html" "Fan Choice"
assert_contains "$evidence_dir/contestant.html" "Ariella Santos"
assert_contains "$evidence_dir/contestant.html" "Overview"
assert_contains "$evidence_dir/contestant.html" "Advocacy"
assert_contains "$evidence_dir/contestant.html" "Gallery"
assert_contains "$evidence_dir/contestant.html" "Collectibles"

"${compose[@]}" restart api
wait_for_url "http://127.0.0.1:8080/ready"
curl --fail --silent --show-error "http://127.0.0.1:3000/platform" \
  >"$evidence_dir/platform-after-api-restart.html"
assert_contains "$evidence_dir/platform-after-api-restart.html" "CrownFi International 2026"

"${compose[@]}" ps --all | tee "$evidence_dir/compose-ps.txt"
echo "CrownFi persistent platform web smoke test passed."
