#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$repo_root"

: "${DATABASE_URL:?set DATABASE_URL to an empty CrownFi PostgreSQL database}"
export CROWNFI_DATABASE_REQUIRED=true
export CROWNFI_API_MODE=local
export CROWNFI_ALLOW_DEMO_SEED=true

cargo fmt --manifest-path services/api/Cargo.toml -- --check
cargo run --manifest-path services/api/Cargo.toml --locked -- seed demo
cargo run --manifest-path services/api/Cargo.toml --locked -- seed demo

psql "$DATABASE_URL" -v ON_ERROR_STOP=1 <<'SQL'
DO $$
BEGIN
  IF (SELECT count(*) FROM organizations WHERE slug = 'crownfi-demo') <> 1 THEN
    RAISE EXCEPTION 'expected one demo organization';
  END IF;
  IF (SELECT count(*) FROM pageants WHERE slug = 'crownfi-international-2026') <> 1 THEN
    RAISE EXCEPTION 'expected one demo pageant';
  END IF;
  IF (
    SELECT count(*)
    FROM pageant_contestants pc
    JOIN pageants p ON p.id = pc.pageant_id
    WHERE p.slug = 'crownfi-international-2026'
  ) <> 3 THEN
    RAISE EXCEPTION 'expected three demo contestants';
  END IF;
END
$$;
SQL

echo "Explicit CrownFi demo seed smoke passed."
