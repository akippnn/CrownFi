#!/usr/bin/env bash
set -euo pipefail
# CrownFi: build and deploy all four Soroban contracts to Stellar Testnet, then print the
# contract ids ready to paste into web/.env.
#
# Prereqs (one time):
#   rustup target add wasm32v1-none
#   cargo install --locked stellar-cli
#   stellar keys generate alice --network testnet --fund
#
# Run from the contracts/ folder:
#   USDC_SAC=<C...> ./scripts/deploy.sh
# Optional overrides: SRC, NETWORK, ROYALTY_BPS, PLATFORM_BPS, MAX_SUPPLY

NETWORK="${NETWORK:-testnet}"
SRC="${SRC:-alice}"
ADMIN="$(stellar keys address "$SRC")"
USDC_SAC="${USDC_SAC:-REPLACE_WITH_TESTNET_USDC_SAC_ID}"   # a USDC/test-token Stellar Asset Contract id
ROYALTY_BPS="${ROYALTY_BPS:-1000}"    # contestant royalty, 10%
PLATFORM_BPS="${PLATFORM_BPS:-500}"   # platform fee, 5%
MAX_SUPPLY="${MAX_SUPPLY:-0}"         # 0 = unlimited

echo "Building all contracts..."
stellar contract build
W="target/wasm32v1-none/release"

deploy () { stellar contract deploy --wasm "$W/$1.wasm" --source "$SRC" --network "$NETWORK" --alias "$2" -- "${@:3}" | tail -n1; }

echo "Deploying audit_anchor..."
AUDIT=$(deploy audit_anchor audit_anchor --admin "$ADMIN")
echo "Deploying ticket..."
TICKET=$(deploy ticket ticket --owner "$ADMIN" --max_supply "$MAX_SUPPLY")
echo "Deploying collectible..."
COLLECTIBLE=$(deploy collectible collectible --owner "$ADMIN" --royalty_receiver "$ADMIN" --royalty_bps "$ROYALTY_BPS" --max_supply "$MAX_SUPPLY")
echo "Deploying sale_splitter..."
SALE=$(deploy sale_splitter sale_splitter --admin "$ADMIN" --usdc "$USDC_SAC" --platform "$ADMIN" --platform_bps "$PLATFORM_BPS")

cat <<OUT

============================================================
 Deployed to $NETWORK. Paste this into web/.env:
------------------------------------------------------------
STELLAR_MODE="live"
STELLAR_NETWORK="$NETWORK"
AUDIT_ANCHOR_CONTRACT_ID="$AUDIT"
TICKET_CONTRACT_ID="$TICKET"
COLLECTIBLE_CONTRACT_ID="$COLLECTIBLE"
SALE_SPLITTER_CONTRACT_ID="$SALE"
============================================================
Next: register a sale listing, e.g.
  stellar contract invoke --id $SALE --source $SRC --network $NETWORK -- \\
    set_listing --listing_id 1 --price 250000000 --contestant <G...> --active true
OUT
