#!/usr/bin/env bash
# Guided CrownFi Testnet setup. It creates funded Testnet identities, deploys all
# Soroban contracts, writes the Stellar values to web/.env, and creates ticket
# listings. It never prints the platform secret.
#
# Run from the repository root:
#   ./contracts/scripts/setup-testnet-freighter.sh
#
# Requirements: bash, Rust/rustup, and a PostgreSQL DATABASE_URL in web/.env if
# you choose the optional web/database bootstrap at the end.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
CONTRACTS_DIR="$ROOT_DIR/contracts"
WEB_DIR="$ROOT_DIR/web"
NETWORK="testnet"
RUN_ID="$(date +%Y%m%d%H%M%S)"
ADMIN_ALIAS="crownfi-testnet-admin"
TREASURY_ALIAS="crownfi-testnet-treasury"

say() { printf '\n\033[1;36m%s\033[0m\n' "$*"; }
note() { printf '%s\n' "$*"; }
fail() { printf '\n\033[1;31mError: %s\033[0m\n' "$*" >&2; exit 1; }
ask_yes_no() {
  local prompt="$1" answer
  read -r -p "$prompt [Y/n] " answer
  [[ -z "$answer" || "$answer" =~ ^[Yy]$ ]]
}

ensure_stellar_cli() {
  if command -v stellar >/dev/null 2>&1; then
    note "✓ Stellar CLI: $(stellar --version | head -n 1)"
    return
  fi
  command -v cargo >/dev/null 2>&1 || fail "Rust/cargo is required. Install Rust from https://rustup.rs, then run this script again."
  ask_yes_no "Stellar CLI is missing. Install it now? This can take several minutes." || fail "Install it later with: cargo install --locked stellar-cli"
  cargo install --locked stellar-cli
}

ensure_wasm_target() {
  command -v rustup >/dev/null 2>&1 || fail "rustup is required. Install Rust from https://rustup.rs, then run this script again."
  if ! rustup target list --installed | grep -qx 'wasm32v1-none'; then
    say "Installing the Soroban WebAssembly target"
    rustup target add wasm32v1-none
  fi
}

ensure_identity() {
  local alias="$1"
  if stellar keys address "$alias" >/dev/null 2>&1; then
    note "✓ Reusing Testnet identity: $alias"
  else
    say "Creating and funding Testnet identity: $alias"
    stellar keys generate "$alias" --network "$NETWORK" --fund
  fi
}

contract_id_from() {
  grep -E '^C[A-Z2-7]{55}$' | tail -n 1
}

deploy() {
  local wasm="$1" alias="$2"
  shift 2
  local output id
  say "Deploying $wasm" >&2
  output="$(stellar contract deploy --wasm "target/wasm32v1-none/release/${wasm}.wasm" --source "$ADMIN_ALIAS" --network "$NETWORK" --alias "$alias" -- "$@")"
  id="$(printf '%s\n' "$output" | contract_id_from)"
  [[ -n "$id" ]] || fail "Could not read the contract id for $wasm. Stellar CLI output was unexpected."
  note "✓ $wasm → $id" >&2
  printf '%s' "$id"
}

upsert_env() {
  local file="$1" key="$2" value="$3" temp
  temp="${file}.crownfi-tmp"
  awk -v key="$key" -v value="$value" '
    BEGIN { found = 0 }
    $0 ~ "^" key "=" { print key "=\"" value "\""; found = 1; next }
    { print }
    END { if (!found) print key "=\"" value "\"" }
  ' "$file" > "$temp"
  mv "$temp" "$file"
}

database_configured() {
  [[ -f "$WEB_DIR/.env" ]] && grep -q '^DATABASE_URL="postgresql://' "$WEB_DIR/.env" && ! grep -q '^DATABASE_URL=.*<' "$WEB_DIR/.env"
}

prompt_for_database() {
  local database_url direct_url
  database_configured && return
  say "Optional database setup"
  note "The only values this script cannot create are your Postgres URLs."
  note "For Supabase: create a project → click Connect → ORMs → Prisma, then copy the pooled DATABASE_URL and DIRECT_URL."
  if ! ask_yes_no "Paste those database URLs now?"; then
    return
  fi
  read -r -s -p "DATABASE_URL (pooled): " database_url; printf '\n'
  read -r -s -p "DIRECT_URL (direct): " direct_url; printf '\n'
  [[ "$database_url" == postgresql://* && "$direct_url" == postgresql://* ]] || fail "Both database values must start with postgresql://. Run the script again when you have the Prisma URLs."
  upsert_env "$WEB_DIR/.env" "DATABASE_URL" "$database_url"
  upsert_env "$WEB_DIR/.env" "DIRECT_URL" "$direct_url"
  note "✓ Database URLs saved to web/.env without displaying them."
}

say "CrownFi + Freighter Testnet setup"
note "This deploys real Testnet contracts. Testnet XLM is free, but never paste a mainnet secret into this flow."

ensure_stellar_cli
ensure_wasm_target
ensure_identity "$ADMIN_ALIAS"
ensure_identity "$TREASURY_ALIAS"

ADMIN_ADDRESS="$(stellar keys address "$ADMIN_ALIAS")"
TREASURY_ADDRESS="$(stellar keys address "$TREASURY_ALIAS")"
ADMIN_SECRET="$(stellar keys show "$ADMIN_ALIAS" | tr -d '\r' | tail -n 1)"
[[ "$ADMIN_SECRET" =~ ^S[A-Z2-7]{55}$ ]] || fail "Could not safely read the secret for $ADMIN_ALIAS. Run 'stellar keys show $ADMIN_ALIAS' manually and check your Stellar CLI setup."

say "Building CrownFi contracts"
cd "$CONTRACTS_DIR"
stellar contract build

USDC="$(deploy usdc_test "crownfi_${RUN_ID}_usdc" --owner "$ADMIN_ADDRESS")"
AUDIT="$(deploy audit_anchor "crownfi_${RUN_ID}_audit" --admin "$ADMIN_ADDRESS")"
TICKET="$(deploy ticket "crownfi_${RUN_ID}_ticket" --owner "$ADMIN_ADDRESS" --max_supply 0)"
COLLECTIBLE="$(deploy collectible "crownfi_${RUN_ID}_collectible" --owner "$ADMIN_ADDRESS" --royalty_receiver "$ADMIN_ADDRESS" --royalty_bps 1000 --max_supply 0)"
SALE="$(deploy sale_splitter "crownfi_${RUN_ID}_sale" --admin "$ADMIN_ADDRESS" --usdc "$USDC" --platform "$ADMIN_ADDRESS" --platform_bps 500)"

say "Creating the four ticket-tier listings"
for listing in "101 500000000" "102 1000000000" "103 2000000000" "104 1500000000"; do
  read -r listing_id price <<< "$listing"
  stellar contract invoke --id "$SALE" --source "$ADMIN_ALIAS" --network "$NETWORK" -- \
    set_listing --listing_id "$listing_id" --price "$price" --contestant "$TREASURY_ADDRESS" --active true
  note "✓ Listing #$listing_id registered"
done

if [[ ! -f "$WEB_DIR/.env" ]]; then
  cp "$WEB_DIR/.env.example" "$WEB_DIR/.env"
  note "Created web/.env from web/.env.example. You still need to replace the database placeholders."
fi

prompt_for_database

say "Writing Testnet values to web/.env"
upsert_env "$WEB_DIR/.env" "STELLAR_MODE" "live"
upsert_env "$WEB_DIR/.env" "STELLAR_NETWORK" "testnet"
upsert_env "$WEB_DIR/.env" "STELLAR_RPC_URL" "https://soroban-testnet.stellar.org"
upsert_env "$WEB_DIR/.env" "STELLAR_PLATFORM_SECRET" "$ADMIN_SECRET"
upsert_env "$WEB_DIR/.env" "AUDIT_ANCHOR_CONTRACT_ID" "$AUDIT"
upsert_env "$WEB_DIR/.env" "TICKET_CONTRACT_ID" "$TICKET"
upsert_env "$WEB_DIR/.env" "COLLECTIBLE_CONTRACT_ID" "$COLLECTIBLE"
upsert_env "$WEB_DIR/.env" "SALE_SPLITTER_CONTRACT_ID" "$SALE"
upsert_env "$WEB_DIR/.env" "USDC_TEST_CONTRACT_ID" "$USDC"
upsert_env "$WEB_DIR/.env" "DEMO_CONTESTANT_PAYOUT" "$TREASURY_ADDRESS"
upsert_env "$WEB_DIR/.env" "NEXT_PUBLIC_ADMIN_WALLETS" "$ADMIN_ADDRESS"
note "✓ Stellar configuration saved. The private key was written only to web/.env and was not displayed."

if database_configured && ask_yes_no "Your database URL looks configured. Bootstrap the app database and collectible listings now?"; then
  say "Installing web dependencies and seeding the app"
  cd "$WEB_DIR"
  npm ci
  npx prisma migrate deploy
  npm run seed
  npx tsx --env-file=.env scripts/register-listings.ts
else
  note "\nDatabase step skipped. Before starting the app, set DATABASE_URL and DIRECT_URL in web/.env, then run:"
  note "  cd web && npm ci && npx prisma migrate deploy && npm run seed"
  note "  npx tsx --env-file=.env scripts/register-listings.ts"
fi

say "Setup complete — test it in Freighter"
note "1. In Freighter, switch to Testnet."
note "2. To test admin anchoring, import the Testnet-only key from: stellar keys show $ADMIN_ALIAS"
note "   (Do not import this key into a mainnet wallet.)"
note "3. Start CrownFi: cd web && npm run dev"
note "4. Connect Freighter, get test USDC, then buy a ticket or collectible."
note "5. Open each receipt at: https://stellar.expert/explorer/testnet/tx/<transaction-hash>"
