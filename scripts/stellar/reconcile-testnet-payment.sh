#!/usr/bin/env bash
set -euo pipefail

api_url="${CROWNFI_API_URL:-http://127.0.0.1:8080}"
horizon_url="${CROWNFI_HORIZON_URL:-https://horizon-testnet.stellar.org}"
admin_token="${ADMIN_DEMO_TOKEN:?ADMIN_DEMO_TOKEN is required}"
actor_user_id="${CROWNFI_ACTOR_USER_ID:?CROWNFI_ACTOR_USER_ID is required}"
intent_id="${CROWNFI_TRANSACTION_INTENT_ID:?CROWNFI_TRANSACTION_INTENT_ID is required}"
evidence_dir="${CROWNFI_STELLAR_RECONCILIATION_EVIDENCE_DIR:-.artifacts/stellar/testnet-$intent_id}"
poll_seconds="${CROWNFI_STELLAR_POLL_SECONDS:-3}"
timeout_seconds="${CROWNFI_STELLAR_CONFIRMATION_TIMEOUT_SECONDS:-120}"

for command in curl python3; do
  command -v "$command" >/dev/null 2>&1 || {
    echo "Required command not found: $command" >&2
    exit 1
  }
done
mkdir -p "$evidence_dir"

api_get() {
  local path=$1
  local output=$2
  curl --fail-with-body --silent --show-error \
    --header "x-admin-demo-token: $admin_token" \
    --header "x-crownfi-user-id: $actor_user_id" \
    "$api_url$path" >"$output"
}

api_post_file() {
  local path=$1
  local input=$2
  local output=$3
  curl --fail-with-body --silent --show-error \
    --request POST \
    --header 'content-type: application/json' \
    --header "x-admin-demo-token: $admin_token" \
    --header "x-crownfi-user-id: $actor_user_id" \
    --data-binary "@$input" \
    "$api_url$path" >"$output"
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
if value is None:
    print("")
else:
    print(value)
PY
}

api_get "/admin/platform/stellar-intents/$intent_id" "$evidence_dir/intent.json"
intent_status=$(json_field "$evidence_dir/intent.json" intent.status)
transaction_status=$(json_field "$evidence_dir/intent.json" transaction.status)
transaction_hash=$(json_field "$evidence_dir/intent.json" transaction.transaction_hash)
signed_envelope=$(json_field "$evidence_dir/intent.json" transaction.signed_envelope_xdr)

if [[ -z "$transaction_hash" || -z "$signed_envelope" ]]; then
  echo "The transaction intent does not contain a signed Stellar transaction" >&2
  exit 1
fi
if [[ ! "$intent_status" =~ ^(signed|submitted|confirmed)$ ]] \
  || [[ ! "$transaction_status" =~ ^(signed|submitted|confirmed)$ ]]; then
  echo "The transaction intent is not ready for Testnet reconciliation" >&2
  exit 1
fi

transaction_endpoint="$horizon_url/transactions/$transaction_hash"
existing_status=$(curl --silent --show-error \
  --output "$evidence_dir/horizon-transaction.json" \
  --write-out '%{http_code}' \
  "$transaction_endpoint")

if [[ "$existing_status" == "404" ]]; then
  submit_status=$(curl --silent --show-error \
    --output "$evidence_dir/horizon-submit.json" \
    --write-out '%{http_code}' \
    --request POST "$horizon_url/transactions" \
    --header 'content-type: application/x-www-form-urlencoded' \
    --data-urlencode "tx=$signed_envelope")
  printf '%s\n' "$submit_status" >"$evidence_dir/horizon-submit-status.txt"
  if [[ ! "$submit_status" =~ ^2[0-9][0-9]$ ]]; then
    cat "$evidence_dir/horizon-submit.json" >&2
    echo "Stellar Testnet rejected the signed transaction" >&2
    exit 1
  fi
  cp "$evidence_dir/horizon-submit.json" "$evidence_dir/horizon-transaction.json"
elif [[ ! "$existing_status" =~ ^2[0-9][0-9]$ ]]; then
  cat "$evidence_dir/horizon-transaction.json" >&2
  echo "Unable to query the Stellar Testnet transaction" >&2
  exit 1
fi

python3 - "$evidence_dir/horizon-transaction.json" "$evidence_dir/submission-receipt.json" "$transaction_hash" <<'PY'
import json
import sys

transaction_path, output_path, expected_hash = sys.argv[1:]
with open(transaction_path, encoding="utf-8") as handle:
    transaction = json.load(handle)
if transaction.get("hash", "").lower() != expected_hash.lower():
    raise SystemExit("Horizon returned an unexpected transaction hash")
with open(output_path, "w", encoding="utf-8") as handle:
    json.dump(
        {
            "transaction_hash": expected_hash.lower(),
            "horizon_status_code": 200,
            "horizon_response": transaction,
        },
        handle,
    )
PY
api_post_file \
  "/admin/platform/stellar-intents/$intent_id/submission-receipt" \
  "$evidence_dir/submission-receipt.json" \
  "$evidence_dir/submission-recorded.json"

started_at=$(date +%s)
while true; do
  confirmation_status=$(curl --silent --show-error \
    --output "$evidence_dir/horizon-transaction.json" \
    --write-out '%{http_code}' \
    "$transaction_endpoint")
  if [[ "$confirmation_status" =~ ^2[0-9][0-9]$ ]]; then
    break
  fi
  if (( $(date +%s) - started_at >= timeout_seconds )); then
    echo "Timed out waiting for Stellar Testnet transaction confirmation" >&2
    exit 1
  fi
  sleep "$poll_seconds"
done

curl --fail-with-body --silent --show-error \
  "$transaction_endpoint/operations?limit=200&order=asc" \
  >"$evidence_dir/horizon-operations.json"

python3 - \
  "$evidence_dir/intent.json" \
  "$evidence_dir/horizon-transaction.json" \
  "$evidence_dir/horizon-operations.json" \
  "$evidence_dir/chain-evidence.json" <<'PY'
from decimal import Decimal, InvalidOperation
import json
import sys

intent_path, transaction_path, operations_path, output_path = sys.argv[1:]
with open(intent_path, encoding="utf-8") as handle:
    detail = json.load(handle)
with open(transaction_path, encoding="utf-8") as handle:
    transaction = json.load(handle)
with open(operations_path, encoding="utf-8") as handle:
    operations = json.load(handle).get("_embedded", {}).get("records", [])

intent = detail["intent"]
expected_hash = detail["transaction"]["transaction_hash"].lower()
if transaction.get("hash", "").lower() != expected_hash:
    raise SystemExit("transaction hash mismatch")
if not transaction.get("successful", False):
    raise SystemExit("transaction was not successful on Stellar")

scale = int(intent["asset_scale"])
factor = Decimal(10) ** scale
matched = None
matched_index = None
for index, operation in enumerate(operations):
    if operation.get("type") != "payment":
        continue
    if operation.get("transaction_hash", "").lower() != expected_hash:
        continue
    if operation.get("source_account") != intent["source_account"]:
        continue
    if operation.get("to") != intent["destination_account"]:
        continue
    if intent["asset_code"] == "XLM":
        asset_matches = operation.get("asset_type") == "native"
    else:
        asset_matches = (
            operation.get("asset_code") == intent["asset_code"]
            and operation.get("asset_issuer") == intent["asset_issuer"]
        )
    if not asset_matches:
        continue
    try:
        amount_minor = int(Decimal(operation["amount"]) * factor)
    except (InvalidOperation, KeyError, ValueError):
        continue
    if amount_minor != int(intent["amount_minor"]):
        continue
    matched = operation
    matched_index = index
    break

if matched is None:
    raise SystemExit("no Stellar payment operation matched the stored intent")
if transaction.get("memo_type") != "text" or transaction.get("memo") != intent["memo_text"]:
    raise SystemExit("Stellar transaction memo did not match the stored intent")

body = {
    "transaction_hash": expected_hash,
    "ledger_sequence": int(transaction["ledger"]),
    "operation_index": matched_index,
    "paging_token": matched["paging_token"],
    "source_account": intent["source_account"],
    "destination_account": intent["destination_account"],
    "amount_minor": int(intent["amount_minor"]),
    "asset_code": intent["asset_code"],
    "asset_scale": scale,
    "asset_issuer": intent["asset_issuer"],
    "memo_text": intent["memo_text"],
    "transaction_successful": bool(transaction["successful"]),
    "closed_at": transaction["created_at"],
    "raw_transaction": transaction,
    "raw_operation": matched,
}
with open(output_path, "w", encoding="utf-8") as handle:
    json.dump(body, handle)
PY

api_post_file \
  "/admin/platform/stellar-intents/$intent_id/chain-evidence" \
  "$evidence_dir/chain-evidence.json" \
  "$evidence_dir/reconciliation.json"
api_get \
  "/admin/platform/stellar-intents/$intent_id/reconciliation" \
  "$evidence_dir/reconciliation-readback.json"

python3 - "$evidence_dir/reconciliation-readback.json" <<'PY'
import json
import sys

with open(sys.argv[1], encoding="utf-8") as handle:
    result = json.load(handle)
assert result["reconciliation"]["status"] == "accepted"
assert result["intent_status"] == "confirmed"
assert result["stellar_transaction_status"] == "confirmed"
assert result["payment_attempt_status"] == "confirmed"
assert result["order_status"] == "paid"
PY

printf 'Confirmed Testnet transaction: https://stellar.expert/explorer/testnet/tx/%s\n' "$transaction_hash"
printf 'Evidence saved to %s\n' "$evidence_dir"
