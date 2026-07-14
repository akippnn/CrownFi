use axum::{
    extract::{Path, State},
    http::{HeaderMap, StatusCode},
    routing::{get, post},
    Json, Router,
};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};
use sqlx::{FromRow, PgPool, Postgres, Transaction};
use time::{format_description::well_known::Rfc3339, OffsetDateTime};
use uuid::Uuid;

use crate::{app::require_admin, error::ApiError, state::AppState};

const STELLAR_ACCOUNT_VERSION: u8 = 48;
const STELLAR_CONTRACT_VERSION: u8 = 16;
const PAYMENT_CURSOR: &str = "commerce-payments-v1";

pub fn router() -> Router<AppState> {
    Router::new()
        .route(
            "/admin/platform/contract-deployments",
            get(list_contract_deployments).post(create_contract_deployment),
        )
        .route(
            "/admin/platform/stellar-intents/:intent_id/submission-receipt",
            post(record_submission_receipt),
        )
        .route(
            "/admin/platform/stellar-intents/:intent_id/chain-evidence",
            post(record_chain_evidence),
        )
        .route(
            "/admin/platform/stellar-intents/:intent_id/reconciliation",
            get(get_reconciliation),
        )
}

#[derive(Debug, Clone, Serialize, FromRow)]
pub struct ContractDeploymentRecord {
    pub id: Uuid,
    pub network: String,
    pub contract_kind: String,
    pub contract_id: String,
    pub wasm_sha256: Option<String>,
    pub source_commit: Option<String>,
    pub deployment_tx_hash: Option<String>,
    pub status: String,
    pub metadata: Value,
    pub created_by_user_id: Uuid,
    pub created_at: OffsetDateTime,
    pub updated_at: OffsetDateTime,
}

#[derive(Debug, Deserialize)]
pub struct CreateContractDeploymentRequest {
    pub network: String,
    pub contract_kind: String,
    pub contract_id: String,
    pub wasm_sha256: Option<String>,
    pub source_commit: Option<String>,
    pub deployment_tx_hash: Option<String>,
    pub status: Option<String>,
    #[serde(default)]
    pub metadata: Value,
}

#[derive(Debug, Deserialize)]
pub struct SubmissionReceiptRequest {
    pub transaction_hash: String,
    pub horizon_status_code: i32,
    pub horizon_response: Value,
}

#[derive(Debug, Deserialize)]
pub struct ChainEvidenceRequest {
    pub transaction_hash: String,
    pub ledger_sequence: i64,
    pub operation_index: i32,
    pub paging_token: String,
    pub source_account: String,
    pub destination_account: String,
    pub amount_minor: i64,
    pub asset_code: String,
    pub asset_scale: i16,
    pub asset_issuer: Option<String>,
    pub memo_text: String,
    pub transaction_successful: bool,
    #[serde(with = "time::serde::rfc3339")]
    pub closed_at: OffsetDateTime,
    pub raw_transaction: Value,
    pub raw_operation: Value,
}

#[derive(Debug, Clone, Serialize, FromRow)]
pub struct ChainEvidenceRecord {
    pub id: Uuid,
    pub transaction_intent_id: Uuid,
    pub stellar_transaction_id: Uuid,
    pub network: String,
    pub transaction_hash: String,
    pub ledger_sequence: i64,
    pub operation_index: i32,
    pub paging_token: String,
    pub source_account: String,
    pub destination_account: String,
    pub amount_minor: i64,
    pub asset_code: String,
    pub asset_scale: i16,
    pub asset_issuer: Option<String>,
    pub memo_text: String,
    pub transaction_successful: bool,
    pub closed_at: OffsetDateTime,
    pub evidence_sha256: String,
    pub raw_transaction: Value,
    pub raw_operation: Value,
    pub created_at: OffsetDateTime,
}

#[derive(Debug, Clone, Serialize, FromRow)]
pub struct ReconciliationResultRecord {
    pub id: Uuid,
    pub transaction_intent_id: Uuid,
    pub chain_evidence_id: Uuid,
    pub status: String,
    pub failure_code: Option<String>,
    pub expected: Value,
    pub actual: Value,
    pub reconciled_by_user_id: Uuid,
    pub reconciled_at: OffsetDateTime,
}

#[derive(Debug, Clone, Serialize)]
pub struct ReconciliationResponse {
    pub evidence: Option<ChainEvidenceRecord>,
    pub reconciliation: Option<ReconciliationResultRecord>,
    pub intent_status: String,
    pub stellar_transaction_status: String,
    pub payment_attempt_status: String,
    pub order_status: String,
}

#[derive(Debug, FromRow)]
struct ExpectedIntent {
    organization_id: Uuid,
    order_id: Uuid,
    payment_attempt_id: Uuid,
    intent_status: String,
    network: String,
    source_account: String,
    destination_account: String,
    amount_minor: i64,
    asset_code: String,
    asset_scale: i16,
    asset_issuer: Option<String>,
    memo_text: String,
    stellar_transaction_id: Uuid,
    transaction_hash: String,
    stellar_transaction_status: String,
    payment_attempt_status: String,
    order_status: String,
}

async fn create_contract_deployment(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(body): Json<CreateContractDeploymentRequest>,
) -> Result<(StatusCode, Json<ContractDeploymentRecord>), ApiError> {
    let actor_user_id = require_admin_actor(&state, &headers)?;
    let pool = database_pool(&state)?;
    ensure_user_exists(pool, actor_user_id).await?;

    let network = validate_registry_network(body.network)?;
    let contract_kind = required_text(body.contract_kind, 100, "invalid_contract_kind")?;
    let contract_id = normalize_contract_id(body.contract_id)?;
    let wasm_sha256 = optional_lower_hex(body.wasm_sha256, 64, "invalid_wasm_sha256")?;
    let source_commit = optional_lower_hex(body.source_commit, 40, "invalid_source_commit")?;
    let deployment_tx_hash = optional_lower_hex(
        body.deployment_tx_hash,
        64,
        "invalid_deployment_transaction_hash",
    )?;
    let status = validate_contract_status(body.status.unwrap_or_else(|| "recorded_unverified".into()))?;
    let metadata = if body.metadata.is_null() {
        serde_json::json!({})
    } else {
        body.metadata
    };

    if let Some(existing) = sqlx::query_as::<_, ContractDeploymentRecord>(
        "SELECT id, network, contract_kind, contract_id, wasm_sha256, source_commit, deployment_tx_hash, status, metadata, created_by_user_id, created_at, updated_at FROM contract_deployments WHERE network = $1 AND contract_kind = $2 AND contract_id = $3",
    )
    .bind(&network)
    .bind(&contract_kind)
    .bind(&contract_id)
    .fetch_optional(pool)
    .await
    .map_err(map_database_error)?
    {
        if existing.wasm_sha256 != wasm_sha256
            || existing.source_commit != source_commit
            || existing.deployment_tx_hash != deployment_tx_hash
            || existing.status != status
            || existing.metadata != metadata
        {
            return Err(ApiError::Conflict("contract_deployment_reused"));
        }
        return Ok((StatusCode::OK, Json(existing)));
    }

    let deployment = sqlx::query_as::<_, ContractDeploymentRecord>(
        "INSERT INTO contract_deployments (id, network, contract_kind, contract_id, wasm_sha256, source_commit, deployment_tx_hash, status, metadata, created_by_user_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id, network, contract_kind, contract_id, wasm_sha256, source_commit, deployment_tx_hash, status, metadata, created_by_user_id, created_at, updated_at",
    )
    .bind(Uuid::new_v4())
    .bind(&network)
    .bind(&contract_kind)
    .bind(&contract_id)
    .bind(&wasm_sha256)
    .bind(&source_commit)
    .bind(&deployment_tx_hash)
    .bind(&status)
    .bind(&metadata)
    .bind(actor_user_id)
    .fetch_one(pool)
    .await
    .map_err(map_database_error)?;

    Ok((StatusCode::CREATED, Json(deployment)))
}

async fn list_contract_deployments(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<Vec<ContractDeploymentRecord>>, ApiError> {
    require_admin(&state, &headers)?;
    let pool = database_pool(&state)?;
    let deployments = sqlx::query_as::<_, ContractDeploymentRecord>(
        "SELECT id, network, contract_kind, contract_id, wasm_sha256, source_commit, deployment_tx_hash, status, metadata, created_by_user_id, created_at, updated_at FROM contract_deployments ORDER BY network, contract_kind, created_at DESC",
    )
    .fetch_all(pool)
    .await
    .map_err(map_database_error)?;
    Ok(Json(deployments))
}

async fn record_submission_receipt(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(intent_id): Path<Uuid>,
    Json(body): Json<SubmissionReceiptRequest>,
) -> Result<(StatusCode, Json<ReconciliationResponse>), ApiError> {
    let actor_user_id = require_admin_actor(&state, &headers)?;
    let pool = database_pool(&state)?;
    let transaction_hash = lower_hex(body.transaction_hash, 64, "invalid_transaction_hash")?;
    if !(200..=299).contains(&body.horizon_status_code) {
        return Err(ApiError::InvalidRequest("horizon_submission_not_successful"));
    }
    if body
        .horizon_response
        .get("hash")
        .and_then(Value::as_str)
        .map(str::to_ascii_lowercase)
        .as_deref()
        != Some(transaction_hash.as_str())
    {
        return Err(ApiError::InvalidRequest("horizon_response_hash_mismatch"));
    }

    let mut tx = pool.begin().await.map_err(map_database_error)?;
    let expected = load_expected_intent_for_update(&mut tx, intent_id).await?;
    require_organization_editor_tx(&mut tx, expected.organization_id, actor_user_id).await?;
    if expected.transaction_hash != transaction_hash {
        return Err(ApiError::Conflict("submitted_transaction_hash_mismatch"));
    }

    if matches!(expected.stellar_transaction_status.as_str(), "submitted" | "confirmed") {
        tx.commit().await.map_err(map_database_error)?;
        return Ok((
            StatusCode::OK,
            Json(load_reconciliation_response(pool, intent_id).await?),
        ));
    }
    if expected.stellar_transaction_status != "signed" || expected.intent_status != "signed" {
        return Err(ApiError::Conflict("stellar_transaction_not_signed"));
    }

    sqlx::query(
        "UPDATE stellar_transactions SET status = 'submitted', horizon_status_code = $2, horizon_response = $3, submitted_at = now(), failure_code = NULL, updated_at = now() WHERE transaction_intent_id = $1 AND status = 'signed'",
    )
    .bind(intent_id)
    .bind(body.horizon_status_code)
    .bind(&body.horizon_response)
    .execute(&mut *tx)
    .await
    .map_err(map_database_error)?;
    sqlx::query(
        "UPDATE transaction_intents SET status = 'submitted', submitted_at = now(), failure_code = NULL, updated_at = now() WHERE id = $1 AND status = 'signed'",
    )
    .bind(intent_id)
    .execute(&mut *tx)
    .await
    .map_err(map_database_error)?;
    write_audit(
        &mut tx,
        expected.organization_id,
        actor_user_id,
        "stellar_transaction.submit",
        "transaction_intent",
        intent_id,
        serde_json::json!({
            "transaction_hash": transaction_hash,
            "horizon_status_code": body.horizon_status_code,
            "network": "testnet",
        }),
    )
    .await?;
    tx.commit().await.map_err(map_database_error)?;

    Ok((
        StatusCode::OK,
        Json(load_reconciliation_response(pool, intent_id).await?),
    ))
}

async fn record_chain_evidence(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(intent_id): Path<Uuid>,
    Json(body): Json<ChainEvidenceRequest>,
) -> Result<(StatusCode, Json<ReconciliationResponse>), ApiError> {
    let actor_user_id = require_admin_actor(&state, &headers)?;
    if body.ledger_sequence <= 0 || body.operation_index < 0 || body.amount_minor <= 0 {
        return Err(ApiError::InvalidRequest("invalid_chain_evidence_numbers"));
    }
    if !(0..=7).contains(&body.asset_scale) {
        return Err(ApiError::InvalidRequest("invalid_asset_scale"));
    }
    let transaction_hash = lower_hex(body.transaction_hash, 64, "invalid_transaction_hash")?;
    let paging_token = required_text(body.paging_token, 200, "invalid_paging_token")?;
    let source_account = normalize_stellar_account(body.source_account)?;
    let destination_account = normalize_stellar_account(body.destination_account)?;
    let asset_code = validate_asset_code(body.asset_code)?;
    let asset_issuer = validate_asset_issuer(&asset_code, body.asset_issuer)?;
    let memo_text = required_text(body.memo_text, 28, "invalid_stellar_memo")?;
    if body.closed_at > OffsetDateTime::now_utc() + time::Duration::minutes(5) {
        return Err(ApiError::InvalidRequest("chain_evidence_closed_at_in_future"));
    }

    let evidence_sha256 = chain_evidence_hash(
        &transaction_hash,
        body.ledger_sequence,
        body.operation_index,
        &paging_token,
        &source_account,
        &destination_account,
        body.amount_minor,
        &asset_code,
        body.asset_scale,
        asset_issuer.as_deref(),
        &memo_text,
        body.transaction_successful,
        body.closed_at,
        &body.raw_transaction,
        &body.raw_operation,
    )?;

    let pool = database_pool(&state)?;
    let mut tx = pool.begin().await.map_err(map_database_error)?;
    let expected = load_expected_intent_for_update(&mut tx, intent_id).await?;
    require_organization_editor_tx(&mut tx, expected.organization_id, actor_user_id).await?;

    if let Some(existing) = sqlx::query_as::<_, ChainEvidenceRecord>(
        "SELECT id, transaction_intent_id, stellar_transaction_id, network, transaction_hash, ledger_sequence, operation_index, paging_token, source_account, destination_account, amount_minor, asset_code, asset_scale, asset_issuer, memo_text, transaction_successful, closed_at, evidence_sha256, raw_transaction, raw_operation, created_at FROM stellar_chain_evidence WHERE network = 'testnet' AND transaction_hash = $1 AND operation_index = $2",
    )
    .bind(&transaction_hash)
    .bind(body.operation_index)
    .fetch_optional(&mut *tx)
    .await
    .map_err(map_database_error)?
    {
        if existing.transaction_intent_id != intent_id || existing.evidence_sha256 != evidence_sha256 {
            return Err(ApiError::Conflict("chain_evidence_reused"));
        }
        tx.commit().await.map_err(map_database_error)?;
        return Ok((
            StatusCode::OK,
            Json(load_reconciliation_response(pool, intent_id).await?),
        ));
    }

    let actual = serde_json::json!({
        "network": "testnet",
        "transaction_hash": transaction_hash,
        "ledger_sequence": body.ledger_sequence,
        "operation_index": body.operation_index,
        "paging_token": paging_token,
        "source_account": source_account,
        "destination_account": destination_account,
        "amount_minor": body.amount_minor,
        "asset_code": asset_code,
        "asset_scale": body.asset_scale,
        "asset_issuer": asset_issuer,
        "memo_text": memo_text,
        "transaction_successful": body.transaction_successful,
        "closed_at": body.closed_at,
    });
    let expected_json = serde_json::json!({
        "network": expected.network,
        "transaction_hash": expected.transaction_hash,
        "source_account": expected.source_account,
        "destination_account": expected.destination_account,
        "amount_minor": expected.amount_minor,
        "asset_code": expected.asset_code,
        "asset_scale": expected.asset_scale,
        "asset_issuer": expected.asset_issuer,
        "memo_text": expected.memo_text,
        "intent_status": expected.intent_status,
        "stellar_transaction_status": expected.stellar_transaction_status,
    });

    let failure_code = reconcile_chain_evidence(
        &expected,
        &transaction_hash,
        &source_account,
        &destination_account,
        body.amount_minor,
        &asset_code,
        body.asset_scale,
        asset_issuer.as_deref(),
        &memo_text,
        body.transaction_successful,
        body.ledger_sequence,
        &paging_token,
        body.closed_at,
        &body.raw_transaction,
        &body.raw_operation,
    );

    let evidence_id = Uuid::new_v4();
    let evidence = sqlx::query_as::<_, ChainEvidenceRecord>(
        "INSERT INTO stellar_chain_evidence (id, transaction_intent_id, stellar_transaction_id, network, transaction_hash, ledger_sequence, operation_index, paging_token, source_account, destination_account, amount_minor, asset_code, asset_scale, asset_issuer, memo_text, transaction_successful, closed_at, evidence_sha256, raw_transaction, raw_operation) VALUES ($1, $2, $3, 'testnet', $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19) RETURNING id, transaction_intent_id, stellar_transaction_id, network, transaction_hash, ledger_sequence, operation_index, paging_token, source_account, destination_account, amount_minor, asset_code, asset_scale, asset_issuer, memo_text, transaction_successful, closed_at, evidence_sha256, raw_transaction, raw_operation, created_at",
    )
    .bind(evidence_id)
    .bind(intent_id)
    .bind(expected.stellar_transaction_id)
    .bind(&transaction_hash)
    .bind(body.ledger_sequence)
    .bind(body.operation_index)
    .bind(&paging_token)
    .bind(&source_account)
    .bind(&destination_account)
    .bind(body.amount_minor)
    .bind(&asset_code)
    .bind(body.asset_scale)
    .bind(&asset_issuer)
    .bind(&memo_text)
    .bind(body.transaction_successful)
    .bind(body.closed_at)
    .bind(&evidence_sha256)
    .bind(&body.raw_transaction)
    .bind(&body.raw_operation)
    .fetch_one(&mut *tx)
    .await
    .map_err(map_database_error)?;

    let reconciliation_id = Uuid::new_v4();
    let reconciliation_status = if failure_code.is_none() {
        "accepted"
    } else {
        "rejected"
    };
    let reconciliation = sqlx::query_as::<_, ReconciliationResultRecord>(
        "INSERT INTO stellar_reconciliation_results (id, transaction_intent_id, chain_evidence_id, status, failure_code, expected, actual, reconciled_by_user_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id, transaction_intent_id, chain_evidence_id, status, failure_code, expected, actual, reconciled_by_user_id, reconciled_at",
    )
    .bind(reconciliation_id)
    .bind(intent_id)
    .bind(evidence_id)
    .bind(reconciliation_status)
    .bind(&failure_code)
    .bind(&expected_json)
    .bind(&actual)
    .bind(actor_user_id)
    .fetch_one(&mut *tx)
    .await
    .map_err(map_database_error)?;

    if failure_code.is_none() {
        let transaction_update = sqlx::query(
            "UPDATE stellar_transactions SET status = 'confirmed', confirmed_at = $2, failure_code = NULL, updated_at = now() WHERE id = $1 AND status = 'submitted'",
        )
        .bind(expected.stellar_transaction_id)
        .bind(body.closed_at)
        .execute(&mut *tx)
        .await
        .map_err(map_database_error)?;
        let intent_update = sqlx::query(
            "UPDATE transaction_intents SET status = 'confirmed', confirmed_at = $2, failure_code = NULL, updated_at = now() WHERE id = $1 AND status = 'submitted'",
        )
        .bind(intent_id)
        .bind(body.closed_at)
        .execute(&mut *tx)
        .await
        .map_err(map_database_error)?;
        let payment_update = sqlx::query(
            "UPDATE payment_attempts SET status = 'confirmed', confirmed_at = $2, failure_code = NULL, updated_at = now() WHERE id = $1 AND status IN ('created', 'awaiting_confirmation')",
        )
        .bind(expected.payment_attempt_id)
        .bind(body.closed_at)
        .execute(&mut *tx)
        .await
        .map_err(map_database_error)?;
        let order_update = sqlx::query(
            "UPDATE orders SET status = 'paid', updated_at = now() WHERE id = $1 AND status = 'awaiting_payment'",
        )
        .bind(expected.order_id)
        .execute(&mut *tx)
        .await
        .map_err(map_database_error)?;

        if transaction_update.rows_affected() != 1
            || intent_update.rows_affected() != 1
            || payment_update.rows_affected() != 1
            || order_update.rows_affected() != 1
        {
            return Err(ApiError::Conflict("stellar_confirmation_state_changed"));
        }

        sqlx::query(
            "INSERT INTO stellar_chain_cursors (id, consumer_name, network, cursor_value, ledger_sequence) VALUES ($1, $2, 'testnet', $3, $4) ON CONFLICT (consumer_name) DO UPDATE SET cursor_value = EXCLUDED.cursor_value, ledger_sequence = EXCLUDED.ledger_sequence, updated_at = now() WHERE stellar_chain_cursors.ledger_sequence < EXCLUDED.ledger_sequence OR (stellar_chain_cursors.ledger_sequence = EXCLUDED.ledger_sequence AND stellar_chain_cursors.cursor_value < EXCLUDED.cursor_value)",
        )
        .bind(Uuid::new_v4())
        .bind(PAYMENT_CURSOR)
        .bind(&paging_token)
        .bind(body.ledger_sequence)
        .execute(&mut *tx)
        .await
        .map_err(map_database_error)?;
    }

    write_audit(
        &mut tx,
        expected.organization_id,
        actor_user_id,
        "stellar_chain_evidence.reconcile",
        "stellar_reconciliation_result",
        reconciliation_id,
        serde_json::json!({
            "transaction_intent_id": intent_id,
            "chain_evidence_id": evidence_id,
            "transaction_hash": transaction_hash,
            "ledger_sequence": body.ledger_sequence,
            "operation_index": body.operation_index,
            "status": reconciliation_status,
            "failure_code": failure_code,
        }),
    )
    .await?;
    tx.commit().await.map_err(map_database_error)?;

    let response = ReconciliationResponse {
        evidence: Some(evidence),
        reconciliation: Some(reconciliation),
        intent_status: if reconciliation_status == "accepted" {
            "confirmed".to_string()
        } else {
            expected.intent_status
        },
        stellar_transaction_status: if reconciliation_status == "accepted" {
            "confirmed".to_string()
        } else {
            expected.stellar_transaction_status
        },
        payment_attempt_status: if reconciliation_status == "accepted" {
            "confirmed".to_string()
        } else {
            expected.payment_attempt_status
        },
        order_status: if reconciliation_status == "accepted" {
            "paid".to_string()
        } else {
            expected.order_status
        },
    };
    let status = if reconciliation_status == "accepted" {
        StatusCode::CREATED
    } else {
        StatusCode::CONFLICT
    };
    Ok((status, Json(response)))
}

async fn get_reconciliation(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(intent_id): Path<Uuid>,
) -> Result<Json<ReconciliationResponse>, ApiError> {
    let actor_user_id = require_admin_actor(&state, &headers)?;
    let pool = database_pool(&state)?;
    let organization_id = sqlx::query_scalar::<_, Uuid>(
        "SELECT organization_id FROM transaction_intents WHERE id = $1",
    )
    .bind(intent_id)
    .fetch_optional(pool)
    .await
    .map_err(map_database_error)?
    .ok_or(ApiError::NotFound)?;
    require_organization_editor(pool, organization_id, actor_user_id).await?;
    Ok(Json(load_reconciliation_response(pool, intent_id).await?))
}

async fn load_expected_intent_for_update(
    tx: &mut Transaction<'_, Postgres>,
    intent_id: Uuid,
) -> Result<ExpectedIntent, ApiError> {
    sqlx::query_as::<_, ExpectedIntent>(
        "SELECT ti.organization_id, ti.order_id, ti.payment_attempt_id, ti.status AS intent_status, ti.network, ti.source_account, ti.destination_account, ti.amount_minor, ti.asset_code, ti.asset_scale, ti.asset_issuer, ti.memo_text, st.id AS stellar_transaction_id, st.transaction_hash, st.status AS stellar_transaction_status, pa.status AS payment_attempt_status, o.status AS order_status FROM transaction_intents ti JOIN stellar_transactions st ON st.transaction_intent_id = ti.id JOIN payment_attempts pa ON pa.id = ti.payment_attempt_id JOIN orders o ON o.id = ti.order_id WHERE ti.id = $1 FOR UPDATE OF ti, st, pa, o",
    )
    .bind(intent_id)
    .fetch_optional(&mut **tx)
    .await
    .map_err(map_database_error)?
    .ok_or(ApiError::NotFound)
}

async fn load_reconciliation_response(
    pool: &PgPool,
    intent_id: Uuid,
) -> Result<ReconciliationResponse, ApiError> {
    let statuses = sqlx::query_as::<_, (String, String, String, String)>(
        "SELECT ti.status, st.status, pa.status, o.status FROM transaction_intents ti JOIN stellar_transactions st ON st.transaction_intent_id = ti.id JOIN payment_attempts pa ON pa.id = ti.payment_attempt_id JOIN orders o ON o.id = ti.order_id WHERE ti.id = $1",
    )
    .bind(intent_id)
    .fetch_optional(pool)
    .await
    .map_err(map_database_error)?
    .ok_or(ApiError::NotFound)?;
    let evidence = sqlx::query_as::<_, ChainEvidenceRecord>(
        "SELECT id, transaction_intent_id, stellar_transaction_id, network, transaction_hash, ledger_sequence, operation_index, paging_token, source_account, destination_account, amount_minor, asset_code, asset_scale, asset_issuer, memo_text, transaction_successful, closed_at, evidence_sha256, raw_transaction, raw_operation, created_at FROM stellar_chain_evidence WHERE transaction_intent_id = $1 ORDER BY created_at DESC LIMIT 1",
    )
    .bind(intent_id)
    .fetch_optional(pool)
    .await
    .map_err(map_database_error)?;
    let reconciliation = sqlx::query_as::<_, ReconciliationResultRecord>(
        "SELECT id, transaction_intent_id, chain_evidence_id, status, failure_code, expected, actual, reconciled_by_user_id, reconciled_at FROM stellar_reconciliation_results WHERE transaction_intent_id = $1",
    )
    .bind(intent_id)
    .fetch_optional(pool)
    .await
    .map_err(map_database_error)?;
    Ok(ReconciliationResponse {
        evidence,
        reconciliation,
        intent_status: statuses.0,
        stellar_transaction_status: statuses.1,
        payment_attempt_status: statuses.2,
        order_status: statuses.3,
    })
}

fn reconcile_chain_evidence(
    expected: &ExpectedIntent,
    transaction_hash: &str,
    source_account: &str,
    destination_account: &str,
    amount_minor: i64,
    asset_code: &str,
    asset_scale: i16,
    asset_issuer: Option<&str>,
    memo_text: &str,
    transaction_successful: bool,
    ledger_sequence: i64,
    paging_token: &str,
    closed_at: OffsetDateTime,
    raw_transaction: &Value,
    raw_operation: &Value,
) -> Option<String> {
    if expected.intent_status != "submitted" || expected.stellar_transaction_status != "submitted" {
        return Some("transaction_not_submitted".to_string());
    }
    if expected.network != "testnet" || transaction_hash != expected.transaction_hash {
        return Some("transaction_hash_mismatch".to_string());
    }
    if !transaction_successful {
        return Some("transaction_failed_on_chain".to_string());
    }
    if source_account != expected.source_account {
        return Some("source_account_mismatch".to_string());
    }
    if destination_account != expected.destination_account {
        return Some("destination_account_mismatch".to_string());
    }
    if amount_minor != expected.amount_minor {
        return Some("amount_mismatch".to_string());
    }
    if asset_code != expected.asset_code
        || asset_scale != expected.asset_scale
        || asset_issuer != expected.asset_issuer.as_deref()
    {
        return Some("asset_mismatch".to_string());
    }
    if memo_text != expected.memo_text {
        return Some("memo_mismatch".to_string());
    }
    if let Some(failure) = reconcile_raw_transaction(
        transaction_hash,
        ledger_sequence,
        memo_text,
        transaction_successful,
        closed_at,
        raw_transaction,
    ) {
        return Some(failure);
    }
    reconcile_raw_operation(
        transaction_hash,
        paging_token,
        source_account,
        destination_account,
        amount_minor,
        asset_code,
        asset_scale,
        asset_issuer,
        raw_operation,
    )
}

fn reconcile_raw_transaction(
    transaction_hash: &str,
    ledger_sequence: i64,
    memo_text: &str,
    transaction_successful: bool,
    closed_at: OffsetDateTime,
    raw: &Value,
) -> Option<String> {
    if raw.get("hash").and_then(Value::as_str).map(str::to_ascii_lowercase).as_deref()
        != Some(transaction_hash)
    {
        return Some("raw_transaction_hash_mismatch".to_string());
    }
    if raw.get("successful").and_then(Value::as_bool) != Some(transaction_successful) {
        return Some("raw_transaction_success_mismatch".to_string());
    }
    if raw.get("ledger").and_then(Value::as_i64) != Some(ledger_sequence) {
        return Some("raw_transaction_ledger_mismatch".to_string());
    }
    if raw.get("memo_type").and_then(Value::as_str) != Some("text")
        || raw.get("memo").and_then(Value::as_str) != Some(memo_text)
    {
        return Some("raw_transaction_memo_mismatch".to_string());
    }
    let Some(created_at) = raw.get("created_at").and_then(Value::as_str) else {
        return Some("raw_transaction_closed_at_missing".to_string());
    };
    let Ok(parsed_closed_at) = OffsetDateTime::parse(created_at, &Rfc3339) else {
        return Some("raw_transaction_closed_at_invalid".to_string());
    };
    if parsed_closed_at != closed_at {
        return Some("raw_transaction_closed_at_mismatch".to_string());
    }
    None
}

fn reconcile_raw_operation(
    transaction_hash: &str,
    paging_token: &str,
    source_account: &str,
    destination_account: &str,
    amount_minor: i64,
    asset_code: &str,
    asset_scale: i16,
    asset_issuer: Option<&str>,
    raw: &Value,
) -> Option<String> {
    if raw.get("type").and_then(Value::as_str) != Some("payment") {
        return Some("raw_operation_type_mismatch".to_string());
    }
    if raw
        .get("transaction_hash")
        .and_then(Value::as_str)
        .map(str::to_ascii_lowercase)
        .as_deref()
        != Some(transaction_hash)
    {
        return Some("raw_operation_transaction_hash_mismatch".to_string());
    }
    if raw.get("paging_token").and_then(Value::as_str) != Some(paging_token) {
        return Some("raw_operation_paging_token_mismatch".to_string());
    }
    if raw.get("source_account").and_then(Value::as_str) != Some(source_account)
        || raw.get("to").and_then(Value::as_str) != Some(destination_account)
    {
        return Some("raw_operation_account_mismatch".to_string());
    }
    let Some(amount) = raw.get("amount").and_then(Value::as_str) else {
        return Some("raw_operation_amount_missing".to_string());
    };
    if parse_decimal_minor(amount, asset_scale) != Some(amount_minor) {
        return Some("raw_operation_amount_mismatch".to_string());
    }
    if asset_code == "XLM" {
        if raw.get("asset_type").and_then(Value::as_str) != Some("native") {
            return Some("raw_operation_asset_mismatch".to_string());
        }
    } else if raw.get("asset_code").and_then(Value::as_str) != Some(asset_code)
        || raw.get("asset_issuer").and_then(Value::as_str) != asset_issuer
    {
        return Some("raw_operation_asset_mismatch".to_string());
    }
    None
}

fn parse_decimal_minor(value: &str, scale: i16) -> Option<i64> {
    if !(0..=7).contains(&scale) || value.starts_with('-') || value.starts_with('+') {
        return None;
    }
    let mut parts = value.split('.');
    let whole = parts.next()?;
    let fraction = parts.next().unwrap_or("");
    if parts.next().is_some()
        || whole.is_empty()
        || !whole.bytes().all(|byte| byte.is_ascii_digit())
        || !fraction.bytes().all(|byte| byte.is_ascii_digit())
        || fraction.len() > scale as usize
    {
        return None;
    }
    let factor = 10_i64.checked_pow(scale as u32)?;
    let whole_minor = whole.parse::<i64>().ok()?.checked_mul(factor)?;
    let mut padded = fraction.to_string();
    padded.extend(std::iter::repeat_n('0', scale as usize - fraction.len()));
    let fraction_minor = if padded.is_empty() {
        0
    } else {
        padded.parse::<i64>().ok()?
    };
    whole_minor.checked_add(fraction_minor)
}

fn chain_evidence_hash(
    transaction_hash: &str,
    ledger_sequence: i64,
    operation_index: i32,
    paging_token: &str,
    source_account: &str,
    destination_account: &str,
    amount_minor: i64,
    asset_code: &str,
    asset_scale: i16,
    asset_issuer: Option<&str>,
    memo_text: &str,
    successful: bool,
    closed_at: OffsetDateTime,
    raw_transaction: &Value,
    raw_operation: &Value,
) -> Result<String, ApiError> {
    let canonical = serde_json::json!({
        "transaction_hash": transaction_hash,
        "ledger_sequence": ledger_sequence,
        "operation_index": operation_index,
        "paging_token": paging_token,
        "source_account": source_account,
        "destination_account": destination_account,
        "amount_minor": amount_minor,
        "asset_code": asset_code,
        "asset_scale": asset_scale,
        "asset_issuer": asset_issuer,
        "memo_text": memo_text,
        "successful": successful,
        "closed_at": closed_at,
        "raw_transaction": raw_transaction,
        "raw_operation": raw_operation,
    });
    let bytes = serde_json::to_vec(&canonical)
        .map_err(|_| ApiError::InvalidRequest("invalid_chain_evidence"))?;
    Ok(hex::encode(Sha256::digest(bytes)))
}

fn normalize_stellar_account(value: String) -> Result<String, ApiError> {
    let value = value.trim().to_ascii_uppercase();
    validate_strkey(&value, STELLAR_ACCOUNT_VERSION, "invalid_stellar_account")?;
    Ok(value)
}

fn normalize_contract_id(value: String) -> Result<String, ApiError> {
    let value = value.trim().to_ascii_uppercase();
    validate_strkey(&value, STELLAR_CONTRACT_VERSION, "invalid_contract_id")?;
    Ok(value)
}

fn validate_strkey(value: &str, expected_version: u8, error: &'static str) -> Result<(), ApiError> {
    if value.len() != 56 {
        return Err(ApiError::InvalidRequest(error));
    }
    let mut decoded = Vec::with_capacity(35);
    let mut accumulator = 0u64;
    let mut bits = 0usize;
    for character in value.bytes() {
        let digit = match character {
            b'A'..=b'Z' => character - b'A',
            b'2'..=b'7' => character - b'2' + 26,
            _ => return Err(ApiError::InvalidRequest(error)),
        };
        accumulator = (accumulator << 5) | u64::from(digit);
        bits += 5;
        while bits >= 8 {
            bits -= 8;
            decoded.push(((accumulator >> bits) & 0xff) as u8);
            accumulator &= if bits == 0 { 0 } else { (1u64 << bits) - 1 };
        }
    }
    if bits != 0 || decoded.len() != 35 || decoded[0] != expected_version {
        return Err(ApiError::InvalidRequest(error));
    }
    let checksum = u16::from_le_bytes([decoded[33], decoded[34]]);
    if crc16_xmodem(&decoded[..33]) != checksum {
        return Err(ApiError::InvalidRequest(error));
    }
    Ok(())
}

fn crc16_xmodem(bytes: &[u8]) -> u16 {
    let mut crc = 0u16;
    for byte in bytes {
        crc ^= u16::from(*byte) << 8;
        for _ in 0..8 {
            crc = if crc & 0x8000 != 0 {
                (crc << 1) ^ 0x1021
            } else {
                crc << 1
            };
        }
    }
    crc
}

fn validate_asset_code(value: String) -> Result<String, ApiError> {
    let value = value.trim().to_ascii_uppercase();
    if value.is_empty()
        || value.len() > 12
        || !value
            .bytes()
            .all(|byte| byte.is_ascii_uppercase() || byte.is_ascii_digit())
    {
        Err(ApiError::InvalidRequest("invalid_asset_code"))
    } else {
        Ok(value)
    }
}

fn validate_asset_issuer(
    asset_code: &str,
    value: Option<String>,
) -> Result<Option<String>, ApiError> {
    let value = value
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_ascii_uppercase);
    if asset_code == "XLM" {
        if value.is_some() {
            return Err(ApiError::InvalidRequest("xlm_must_not_have_issuer"));
        }
        return Ok(None);
    }
    let issuer = value.ok_or(ApiError::InvalidRequest("asset_issuer_required"))?;
    validate_strkey(&issuer, STELLAR_ACCOUNT_VERSION, "invalid_asset_issuer")?;
    Ok(Some(issuer))
}

fn validate_registry_network(value: String) -> Result<String, ApiError> {
    let value = value.trim().to_ascii_lowercase();
    if matches!(value.as_str(), "testnet" | "mainnet") {
        Ok(value)
    } else {
        Err(ApiError::InvalidRequest("invalid_contract_network"))
    }
}

fn validate_contract_status(value: String) -> Result<String, ApiError> {
    let value = value.trim().to_ascii_lowercase();
    if matches!(
        value.as_str(),
        "recorded_unverified" | "verified" | "deprecated"
    ) {
        Ok(value)
    } else {
        Err(ApiError::InvalidRequest("invalid_contract_status"))
    }
}

fn lower_hex(value: String, length: usize, error: &'static str) -> Result<String, ApiError> {
    let value = value.trim().to_ascii_lowercase();
    if value.len() != length || !value.bytes().all(|byte| byte.is_ascii_hexdigit()) {
        Err(ApiError::InvalidRequest(error))
    } else {
        Ok(value)
    }
}

fn optional_lower_hex(
    value: Option<String>,
    length: usize,
    error: &'static str,
) -> Result<Option<String>, ApiError> {
    value
        .map(|value| lower_hex(value, length, error))
        .transpose()
}

fn required_text(value: String, max_len: usize, error: &'static str) -> Result<String, ApiError> {
    let value = value.trim().to_string();
    if value.is_empty() || value.chars().count() > max_len {
        Err(ApiError::InvalidRequest(error))
    } else {
        Ok(value)
    }
}

fn database_pool(state: &AppState) -> Result<&PgPool, ApiError> {
    state
        .database
        .as_ref()
        .ok_or(ApiError::ServiceUnavailable("database_not_configured"))
}

fn require_admin_actor(state: &AppState, headers: &HeaderMap) -> Result<Uuid, ApiError> {
    require_admin(state, headers)?;
    headers
        .get("x-crownfi-user-id")
        .and_then(|value| value.to_str().ok())
        .and_then(|value| Uuid::parse_str(value).ok())
        .ok_or(ApiError::Unauthorized)
}

async fn ensure_user_exists(pool: &PgPool, user_id: Uuid) -> Result<(), ApiError> {
    let exists = sqlx::query_scalar::<_, bool>("SELECT EXISTS (SELECT 1 FROM users WHERE id = $1)")
        .bind(user_id)
        .fetch_one(pool)
        .await
        .map_err(map_database_error)?;
    if exists {
        Ok(())
    } else {
        Err(ApiError::Unauthorized)
    }
}

async fn require_organization_editor(
    pool: &PgPool,
    organization_id: Uuid,
    user_id: Uuid,
) -> Result<(), ApiError> {
    let allowed = sqlx::query_scalar::<_, bool>(
        "SELECT EXISTS (SELECT 1 FROM organization_members WHERE organization_id = $1 AND user_id = $2 AND status = 'active' AND role IN ('owner', 'admin', 'editor'))",
    )
    .bind(organization_id)
    .bind(user_id)
    .fetch_one(pool)
    .await
    .map_err(map_database_error)?;
    if allowed {
        Ok(())
    } else {
        Err(ApiError::Forbidden)
    }
}

async fn require_organization_editor_tx(
    tx: &mut Transaction<'_, Postgres>,
    organization_id: Uuid,
    user_id: Uuid,
) -> Result<(), ApiError> {
    let allowed = sqlx::query_scalar::<_, bool>(
        "SELECT EXISTS (SELECT 1 FROM organization_members WHERE organization_id = $1 AND user_id = $2 AND status = 'active' AND role IN ('owner', 'admin', 'editor'))",
    )
    .bind(organization_id)
    .bind(user_id)
    .fetch_one(&mut **tx)
    .await
    .map_err(map_database_error)?;
    if allowed {
        Ok(())
    } else {
        Err(ApiError::Forbidden)
    }
}

async fn write_audit(
    tx: &mut Transaction<'_, Postgres>,
    organization_id: Uuid,
    actor_user_id: Uuid,
    action: &str,
    entity_type: &str,
    entity_id: Uuid,
    metadata: Value,
) -> Result<(), ApiError> {
    sqlx::query(
        "INSERT INTO audit_logs (id, organization_id, actor_user_id, action, entity_type, entity_id, metadata) VALUES ($1, $2, $3, $4, $5, $6, $7)",
    )
    .bind(Uuid::new_v4())
    .bind(organization_id)
    .bind(actor_user_id)
    .bind(action)
    .bind(entity_type)
    .bind(entity_id)
    .bind(metadata)
    .execute(&mut **tx)
    .await
    .map_err(map_database_error)?;
    Ok(())
}

fn map_database_error(error: sqlx::Error) -> ApiError {
    if let Some(database_error) = error.as_database_error() {
        let code = database_error.code().map(|code| code.into_owned());
        return match code.as_deref() {
            Some("23505") => ApiError::Conflict("resource_already_exists"),
            Some("23503") => ApiError::InvalidRequest("related_resource_not_found"),
            Some("23514") | Some("22P02") | Some("22003") => {
                ApiError::InvalidRequest("database_constraint_failed")
            }
            _ => {
                tracing::error!(%error, "Stellar reconciliation database operation failed");
                ApiError::Database
            }
        };
    }
    tracing::error!(%error, "Stellar reconciliation database operation failed");
    ApiError::Database
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_stellar_decimal_amounts_exactly() {
        assert_eq!(parse_decimal_minor("0.2500000", 7), Some(2_500_000));
        assert_eq!(parse_decimal_minor("1", 7), Some(10_000_000));
        assert_eq!(parse_decimal_minor("1.2", 7), Some(12_000_000));
        assert_eq!(parse_decimal_minor("1.00000000", 7), None);
        assert_eq!(parse_decimal_minor("-1.0000000", 7), None);
    }

    #[test]
    fn validates_known_account_strkey() {
        assert!(validate_strkey(
            "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF",
            STELLAR_ACCOUNT_VERSION,
            "invalid"
        )
        .is_ok());
    }
}
