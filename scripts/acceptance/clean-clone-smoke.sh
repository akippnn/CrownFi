#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$repo_root"

env_file="${CROWNFI_SMOKE_ENV_FILE:-infra/.env.smoke}"
evidence_dir="${CROWNFI_SMOKE_EVIDENCE_DIR:-.artifacts/acceptance/clean-clone}"
cleanup="${CROWNFI_SMOKE_CLEANUP:-0}"
timeout_seconds="${CROWNFI_SMOKE_TIMEOUT_SECONDS:-300}"

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Required command not found: $1" >&2
    exit 1
  fi
}

require_command docker
require_command curl

docker compose version >/dev/null

if [[ ! -f "$env_file" ]]; then
  cp infra/.env.example "$env_file"
  echo "Created local smoke environment: $env_file"
fi

mkdir -p "$evidence_dir"
compose=(docker compose --env-file "$env_file" -f infra/docker-compose.yml)

show_failure_context() {
  local status=$?
  if [[ $status -ne 0 ]]; then
    echo
    echo "Smoke test failed. Recent Compose state and logs follow." >&2
    "${compose[@]}" ps -a || true
    "${compose[@]}" logs --no-color --tail=200 || true
  fi

  if [[ "$cleanup" == "1" ]]; then
    "${compose[@]}" down --remove-orphans || true
  fi

  exit "$status"
}
trap show_failure_context EXIT

wait_for_url() {
  local name=$1
  local url=$2
  local output=$3
  local started_at
  started_at=$(date +%s)

  while true; do
    if curl --fail --silent --show-error "$url" >"$output"; then
      echo "$name is reachable: $url"
      return 0
    fi

    if (( $(date +%s) - started_at >= timeout_seconds )); then
      echo "Timed out waiting for $name at $url" >&2
      return 1
    fi

    sleep 3
  done
}

echo "Building and starting the canonical CrownFi platform stack..."
"${compose[@]}" up --build --detach

wait_for_url "Rust API health" "http://127.0.0.1:8080/health" "$evidence_dir/api-health.json"
wait_for_url "Rust API readiness" "http://127.0.0.1:8080/ready" "$evidence_dir/api-ready.json"
wait_for_url "Next.js health" "http://127.0.0.1:3000/api/health" "$evidence_dir/web-health.json"

"${compose[@]}" exec -T postgres sh -c 'pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB"' \
  | tee "$evidence_dir/postgres-health.txt"
"${compose[@]}" exec -T redis redis-cli ping \
  | tee "$evidence_dir/redis-health.txt"

db_init_id=$("${compose[@]}" ps --all --quiet db-init)
if [[ -z "$db_init_id" ]]; then
  echo "db-init container was not created" >&2
  exit 1
fi

db_init_exit=$(docker inspect --format '{{.State.ExitCode}}' "$db_init_id")
if [[ "$db_init_exit" != "0" ]]; then
  echo "db-init exited with status $db_init_exit" >&2
  exit 1
fi

"${compose[@]}" ps -a | tee "$evidence_dir/compose-ps.txt"

if ! grep -q '"ok":true' "$evidence_dir/api-health.json"; then
  echo "Rust API health response did not report ok=true" >&2
  exit 1
fi
if ! grep -q '"ok":true' "$evidence_dir/api-ready.json"; then
  echo "Rust API readiness response did not report ok=true" >&2
  exit 1
fi
if ! grep -q '"ok":true' "$evidence_dir/web-health.json"; then
  echo "Next.js health response did not report ok=true" >&2
  exit 1
fi
if ! grep -qx 'PONG' "$evidence_dir/redis-health.txt"; then
  echo "Redis did not return PONG" >&2
  exit 1
fi

echo
echo "CrownFi clean-clone smoke test passed."
echo "Web: http://127.0.0.1:3000"
echo "API: http://127.0.0.1:8080"
echo "Evidence: $evidence_dir"

if [[ "$cleanup" != "1" ]]; then
  echo "Stop the stack with: docker compose --env-file '$env_file' -f infra/docker-compose.yml down"
fi
