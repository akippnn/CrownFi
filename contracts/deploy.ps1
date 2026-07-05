# CrownFi - deploy the 4 Soroban contracts to Stellar Testnet (Windows / PowerShell)
#
# One-time prerequisites:
#   cargo install --locked stellar-cli
#   stellar keys generate alice --network testnet --fund
#
# Run from the contracts folder:
#   cd D:\CrownFi\F3\crownfi\contracts
#   powershell -ExecutionPolicy Bypass -File .\deploy.ps1
# (the -ExecutionPolicy Bypass avoids the "running scripts is disabled" error)

$ErrorActionPreference = "Stop"
$NETWORK = "testnet"
$SRC     = "alice"                       # your funded deployer identity
$W       = "target/wasm32v1-none/release"

# NOTE: running this again deploys BRAND-NEW contracts (fresh ids each time). If you already have
# working ids in web/.env, you don't need to re-run — read them back with: stellar contract alias ls

# --- Prerequisite checks ---
if (-not (Get-Command stellar -ErrorAction SilentlyContinue)) {
    throw "Stellar CLI not found. Install it first:  cargo install --locked stellar-cli"
}

# --- Deployer address (becomes the admin/owner of every contract) ---
$ADMIN = (stellar keys address $SRC 2>$null | Select-Object -First 1)
$ADMIN = "$ADMIN".Trim()
if (-not $ADMIN) {
    throw "Identity '$SRC' not found. Create + fund it:  stellar keys generate $SRC --network $NETWORK --fund"
}
Write-Host "Deployer (admin/owner): $ADMIN" -ForegroundColor Cyan

# --- Build all 5 contracts to wasm ---
Write-Host "`nBuilding contracts..." -ForegroundColor Yellow
stellar contract build
if ($LASTEXITCODE -ne 0) { throw "build failed" }

# --- Helper: deploy one contract, return its C... id ---
function Deploy-Contract {
    param([string]$Wasm, [string]$Alias, [string[]]$CtorArgs)
    Write-Host "`nDeploying $Alias..." -ForegroundColor Yellow
    $out = stellar contract deploy --wasm "$W/$Wasm" --source $SRC --network $NETWORK --alias $Alias -- $CtorArgs
    if ($LASTEXITCODE -ne 0) { throw "deploy $Alias failed (exit $LASTEXITCODE)" }
    # The contract id is a 56-char strkey starting with C.
    $id = ($out | Where-Object { $_ -match '^C[A-Z2-7]{55}$' } | Select-Object -Last 1)
    if (-not $id) { $id = ($out | Select-Object -Last 1) }
    $id = "$id".Trim()
    Write-Host "  $Alias => $id" -ForegroundColor Green
    return $id
}

# The test-USDC token first (the sale-splitter settles in it).
$USDC        = Deploy-Contract "usdc_test.wasm"    "usdc_test"    @("--owner", $ADMIN)
$AUDIT       = Deploy-Contract "audit_anchor.wasm" "audit_anchor" @("--admin", $ADMIN)
$TICKET      = Deploy-Contract "ticket.wasm"       "ticket"       @("--owner", $ADMIN, "--max_supply", "0")
$COLLECTIBLE = Deploy-Contract "collectible.wasm"  "collectible"  @("--owner", $ADMIN, "--royalty_receiver", $ADMIN, "--royalty_bps", "1000", "--max_supply", "0")
$SALE        = Deploy-Contract "sale_splitter.wasm" "sale_splitter" @("--admin", $ADMIN, "--usdc", $USDC, "--platform", $ADMIN, "--platform_bps", "500")

# --- Print the ready-to-paste .env block ---
Write-Host "`n============================================================" -ForegroundColor Cyan
Write-Host " Deployed to $NETWORK. Paste this into web\.env:" -ForegroundColor Cyan
Write-Host "------------------------------------------------------------"
Write-Host "STELLAR_MODE=`"live`""
Write-Host "STELLAR_NETWORK=`"$NETWORK`""
Write-Host "AUDIT_ANCHOR_CONTRACT_ID=`"$AUDIT`""
Write-Host "TICKET_CONTRACT_ID=`"$TICKET`""
Write-Host "COLLECTIBLE_CONTRACT_ID=`"$COLLECTIBLE`""
Write-Host "SALE_SPLITTER_CONTRACT_ID=`"$SALE`""
Write-Host "USDC_TEST_CONTRACT_ID=`"$USDC`""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "Also set STELLAR_PLATFORM_SECRET (alice's secret) + DEMO_CONTESTANT_PAYOUT (a G... wallet)."
Write-Host "Then register listings:  cd ..\web ;  npx tsx --env-file=.env scripts/register-listings.ts"
Write-Host "And the ticket tiers 101/102/103 (see DEPLOY_GUIDE.md 4f). Then:  npm run dev"
