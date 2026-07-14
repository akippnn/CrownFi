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
use time::OffsetDateTime;
use uuid::Uuid;

use crate::{app::require_admin, error::ApiError, state::AppState};

const ACCOUNT_VERSION: u8 = 48;
const WORKER_HEADER: &str = "x-crownfi-payout-worker-token";

pub fn router() -> Router<AppState> {
    Router::new()
        .route(
            "/admin/platform/organizations/:organization_id/products/:product_id/payout-rules",
            post(create_payout_rule),
        )
        .route(
            "/admin/platform/orders/:order_id/payout-batches",
            post(create_payout_batch),
        )
        .route(
            "/admin/platform/payout-batches/:batch_id",
            get(get_payout_batch),
        )
        .route(
            "/internal/platform/payout-batches/:batch_id/submission",
            post(record_payout_submission),
        )
        .route(
            "/internal/platform/payout-batches/:batch_id/transfer-evidence",
            post(record_transfer_evidence),
        )
        .route(
            "/internal/platform/payout-batches/:batch_id/failure",
            post(record_payout_failure),
        )
}

#[derive(Debug, Clone, Serialize, FromRow)]
pub struct PayoutRuleRecord {
    pub id: Uuid,
    pub organization_id: Uuid,
    pub product_id: Uuid,
    pub candidate_account: String,
    pub organizer_account: String,
    pub platform_account: String,
    pub candidate_bps: i32,
    pub organizer_bps: i32,
    pub platform_bps: i32,
    pub status: String,
    pub created_by_user_id: Uuid,
    pub created_at: OffsetDateTime,
    pub updated_at: OffsetDateTime,
    pub source_account: String,
}

#[derive(Debug, Clone, Serialize, FromRow)]
pub struct PayoutBatchRecord {
    pub id: Uuid,
    pub organization_id: Uuid,
    pub order_id: Uuid,
    pub payout_rule_id: Uuid,
    pub status: String,
    pub amount_minor: i64,
    pub asset_code: String,
    pub asset_scale: i16,
    pub asset_issuer: Option<String>,
    pub idempotency_key: String,
    pub request_sha256: String,
    pub expected_transfer_count: i32,
    pub confirmed_transfer_count: i32,
    pub submitted_transaction_hash: Option<String>,
    pub submission_response: Option<Value>,
    pub submitted_at: Option<OffsetDateTime>,
    pub confirmed_at: Option<OffsetDateTime>,
    pub failure_code: Option<String>,
    pub created_by_user_id: Uuid,
    pub created_at: OffsetDateTime,
    pub updated_at: OffsetDateTime,
}

#[derive(Debug, Clone, Serialize, FromRow)]
pub struct PayoutTransferRecord {
    pub id: Uuid,
    pub payout_batch_id: Uuid,
    pub role: String,
    pub recipient_account: String,
    pub expected_amount_minor: i64,
    pub status: String,
    pub operation_index: Option<i32>,
    pub transaction_hash: Option<String>,
    pub actual_amount_minor: Option<i64>,
    pub ledger_sequence: Option<i64>,
    pub failure_code: Option<String>,
    pub confirmed_at: Option<OffsetDateTime>,
    pub created_at: OffsetDateTime,
    pub updated_at: OffsetDateTime,
}

#[derive(Debug, Clone, Serialize, FromRow)]
pub struct PayoutEvidenceRecord {
    pub id: Uuid,
    pub payout_transfer_id: Uuid,
    pub network: String,
    pub transaction_hash: String,
    pub operation_index: i32,
    pub source_account: String,
    pub recipient_account: String,
    pub amount_minor: i64,
    pub asset_code: String,
    pub asset_scale: i16,
    pub asset_issuer: Option<String>,
    pub ledger_sequence: i64,
    pub successful: bool,
    pub evidence_sha256: String,
    pub raw_operation: Value,
    pub processing_status: String,
    pub reconciliation_error: Option<String>,
    pub created_at: OffsetDateTime,
}

#[derive(Debug, Clone, Serialize)]
pub struct PayoutBatchResponse {
    pub batch: PayoutBatchRecord,
    pub transfers: Vec<PayoutTransferRecord>,
    pub latest_evidence: Vec<PayoutEvidenceRecord>,
}

#[derive(Debug, Deserialize)]
pub struct CreatePayoutRuleRequest {
    pub source_account: String,
    pub candidate_account: String,
    pub organizer_account: String,
    pub platform_account: String,
    pub candidate_bps: i32,
    pub organizer_bps: i32,
    pub platform_bps: i32,
    pub status: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct CreatePayoutBatchRequest {
    pub payout_rule_id: Uuid,
    pub idempotency_key: String,
}

#[derive(Debug, Deserialize)]
pub struct PayoutSubmissionRequest {
    pub transaction_hash: String,
    #[serde(default)]
    pub submission_response: Value,
}

#[derive(Debug, Deserialize)]
pub struct TransferEvidenceRequest {
    pub role: String,
    pub transaction_hash: String,
    pub operation_index: i32,
    pub source_account: String,
    pub recipient_account: String,
    pub amount_minor: i64,
    pub asset_code: String,
    pub asset_scale: i16,
    pub asset_issuer: Option<String>,
    pub ledger_sequence: i64,
    pub successful: bool,
    pub raw_operation: Value,
}

#[derive(Debug, Deserialize)]
pub struct PayoutFailureRequest {
    pub failure_code: String,
}

#[derive(Debug, FromRow)]
struct OrderPayoutSource {
    organization_id: Uuid,
    status: String,
    environment: String,
    amount_minor: i64,
    asset_code: String,
    asset_scale: i16,
    asset_issuer: Option<String>,
    product_id: Uuid,
    quantity: i64,
}

async fn create_payout_rule(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((organization_id, product_id)): Path<(Uuid, Uuid)>,
    Json(body): Json<CreatePayoutRuleRequest>,
) -> Result<(StatusCode, Json<PayoutRuleRecord>), ApiError> {
    let actor = require_admin_actor(&state, &headers)?;
    let pool = database_pool(&state)?;
    require_editor(pool, organization_id, actor).await?;
    let product_org = sqlx::query_scalar::<_, Uuid>("SELECT organization_id FROM products WHERE id=$1")
        .bind(product_id)
        .fetch_optional(pool)
        .await
        .map_err(db_error)?
        .ok_or(ApiError::NotFound)?;
    if product_org != organization_id {
        return Err(ApiError::NotFound);
    }

    let source_account = account(body.source_account)?;
    let candidate_account = account(body.candidate_account)?;
    let organizer_account = account(body.organizer_account)?;
    let platform_account = account(body.platform_account)?;
    if source_account == candidate_account
        || source_account == organizer_account
        || source_account == platform_account
        || candidate_account == organizer_account
        || candidate_account == platform_account
        || organizer_account == platform_account
    {
        return Err(ApiError::InvalidRequest("payout_accounts_must_be_distinct"));
    }
    validate_bps(body.candidate_bps, body.organizer_bps, body.platform_bps)?;
    let status = payout_rule_status(body.status.unwrap_or_else(|| "active".into()))?;

    let mut tx = pool.begin().await.map_err(db_error)?;
    require_editor_tx(&mut tx, organization_id, actor).await?;
    let rule = sqlx::query_as::<_, PayoutRuleRecord>(
        "INSERT INTO payout_rules (id,organization_id,product_id,candidate_account,organizer_account,platform_account,candidate_bps,organizer_bps,platform_bps,status,created_by_user_id,source_account) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id,organization_id,product_id,candidate_account,organizer_account,platform_account,candidate_bps,organizer_bps,platform_bps,status,created_by_user_id,created_at,updated_at,source_account",
    )
    .bind(Uuid::new_v4())
    .bind(organization_id)
    .bind(product_id)
    .bind(&candidate_account)
    .bind(&organizer_account)
    .bind(&platform_account)
    .bind(body.candidate_bps)
    .bind(body.organizer_bps)
    .bind(body.platform_bps)
    .bind(&status)
    .bind(actor)
    .bind(&source_account)
    .fetch_one(&mut *tx)
    .await
    .map_err(db_error)?;
    audit(
        &mut tx,
        organization_id,
        actor,
        "payout_rule.create",
        "payout_rule",
        rule.id,
        serde_json::json!({
            "product_id": product_id,
            "source_account": source_account,
            "candidate_account": candidate_account,
            "organizer_account": organizer_account,
            "platform_account": platform_account,
            "candidate_bps": body.candidate_bps,
            "organizer_bps": body.organizer_bps,
            "platform_bps": body.platform_bps,
            "status": status
        }),
    )
    .await?;
    tx.commit().await.map_err(db_error)?;
    Ok((StatusCode::CREATED, Json(rule)))
}

async fn create_payout_batch(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(order_id): Path<Uuid>,
    Json(body): Json<CreatePayoutBatchRequest>,
) -> Result<(StatusCode, Json<PayoutBatchResponse>), ApiError> {
    let actor = require_admin_actor(&state, &headers)?;
    let pool = database_pool(&state)?;
    let idempotency_key = required_text(body.idempotency_key, 200, "invalid_payout_idempotency_key")?;
    let mut tx = pool.begin().await.map_err(db_error)?;
    let rows = sqlx::query_as::<_, OrderPayoutSource>(
        "SELECT o.organization_id,o.status,o.environment,o.amount_minor,o.asset_code,o.asset_scale,o.asset_issuer,oi.product_id,oi.quantity FROM orders o JOIN order_items oi ON oi.order_id=o.id WHERE o.id=$1 FOR UPDATE OF o,oi",
    )
    .bind(order_id)
    .fetch_all(&mut *tx)
    .await
    .map_err(db_error)?;
    if rows.is_empty() {
        return Err(ApiError::NotFound);
    }
    if rows.len() != 1 || rows[0].quantity != 1 {
        return Err(ApiError::Conflict("one_payout_product_required"));
    }
    let order = &rows[0];
    require_editor_tx(&mut tx, order.organization_id, actor).await?;
    if order.status != "fulfilled" {
        return Err(ApiError::Conflict("fulfilled_order_required_for_payout"));
    }
    if order.environment != "testnet" {
        return Err(ApiError::InvalidRequest("payout_requires_testnet"));
    }
    let payment_confirmed = sqlx::query_scalar::<_, bool>(
        "SELECT EXISTS (SELECT 1 FROM transaction_intents ti JOIN stellar_reconciliation_results sr ON sr.transaction_intent_id=ti.id WHERE ti.order_id=$1 AND sr.status='accepted')",
    )
    .bind(order_id)
    .fetch_one(&mut *tx)
    .await
    .map_err(db_error)?;
    if !payment_confirmed {
        return Err(ApiError::Conflict("indexed_payment_confirmation_required"));
    }
    let rule = sqlx::query_as::<_, PayoutRuleRecord>(
        "SELECT id,organization_id,product_id,candidate_account,organizer_account,platform_account,candidate_bps,organizer_bps,platform_bps,status,created_by_user_id,created_at,updated_at,source_account FROM payout_rules WHERE id=$1 FOR UPDATE",
    )
    .bind(body.payout_rule_id)
    .fetch_optional(&mut *tx)
    .await
    .map_err(db_error)?
    .ok_or(ApiError::NotFound)?;
    if rule.organization_id != order.organization_id || rule.product_id != order.product_id {
        return Err(ApiError::InvalidRequest("payout_rule_scope_mismatch"));
    }
    if rule.status != "active" {
        return Err(ApiError::Conflict("active_payout_rule_required"));
    }
    validate_bps(rule.candidate_bps, rule.organizer_bps, rule.platform_bps)?;
    let split = calculate_split(
        order.amount_minor,
        rule.candidate_bps,
        rule.organizer_bps,
        rule.platform_bps,
    )?;
    if split.iter().any(|amount| *amount <= 0) {
        return Err(ApiError::Conflict("zero_value_payout_share_not_supported"));
    }
    let request_sha256 = hash_text(&format!(
        "organization={};order={order_id};rule={};amount={};asset={}:{}:{};candidate={};organizer={};platform={}",
        order.organization_id,
        rule.id,
        order.amount_minor,
        order.asset_code,
        order.asset_scale,
        order.asset_issuer.as_deref().unwrap_or_default(),
        split[0],
        split[1],
        split[2]
    ));

    if let Some((existing_id, existing_hash)) = sqlx::query_as::<_, (Uuid, String)>(
        "SELECT id,request_sha256 FROM payout_batches WHERE organization_id=$1 AND idempotency_key=$2 FOR UPDATE",
    )
    .bind(order.organization_id)
    .bind(&idempotency_key)
    .fetch_optional(&mut *tx)
    .await
    .map_err(db_error)?
    {
        if existing_hash != request_sha256 {
            return Err(ApiError::Conflict("idempotency_key_reused"));
        }
        tx.commit().await.map_err(db_error)?;
        return Ok((StatusCode::OK, Json(load_batch(pool, existing_id).await?)));
    }

    let batch_id = Uuid::new_v4();
    sqlx::query(
        "INSERT INTO payout_batches (id,organization_id,order_id,payout_rule_id,status,amount_minor,asset_code,asset_scale,asset_issuer,idempotency_key,request_sha256,created_by_user_id) VALUES ($1,$2,$3,$4,'prepared',$5,$6,$7,$8,$9,$10,$11)",
    )
    .bind(batch_id)
    .bind(order.organization_id)
    .bind(order_id)
    .bind(rule.id)
    .bind(order.amount_minor)
    .bind(&order.asset_code)
    .bind(order.asset_scale)
    .bind(&order.asset_issuer)
    .bind(&idempotency_key)
    .bind(&request_sha256)
    .bind(actor)
    .execute(&mut *tx)
    .await
    .map_err(db_error)?;
    for (role, recipient, amount) in [
        ("candidate", rule.candidate_account.as_str(), split[0]),
        ("organizer", rule.organizer_account.as_str(), split[1]),
        ("platform", rule.platform_account.as_str(), split[2]),
    ] {
        sqlx::query(
            "INSERT INTO payout_transfers (id,payout_batch_id,role,recipient_account,expected_amount_minor,status) VALUES ($1,$2,$3,$4,$5,'pending')",
        )
        .bind(Uuid::new_v4())
        .bind(batch_id)
        .bind(role)
        .bind(recipient)
        .bind(amount)
        .execute(&mut *tx)
        .await
        .map_err(db_error)?;
    }
    audit(
        &mut tx,
        order.organization_id,
        actor,
        "payout_batch.prepare",
        "payout_batch",
        batch_id,
        serde_json::json!({
            "order_id": order_id,
            "payout_rule_id": rule.id,
            "amount_minor": order.amount_minor,
            "asset_code": order.asset_code,
            "candidate_amount_minor": split[0],
            "organizer_amount_minor": split[1],
            "platform_amount_minor": split[2]
        }),
    )
    .await?;
    tx.commit().await.map_err(db_error)?;
    Ok((StatusCode::CREATED, Json(load_batch(pool, batch_id).await?)))
}

async fn get_payout_batch(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(batch_id): Path<Uuid>,
) -> Result<Json<PayoutBatchResponse>, ApiError> {
    let actor = require_admin_actor(&state, &headers)?;
    let pool = database_pool(&state)?;
    let organization_id = sqlx::query_scalar::<_, Uuid>(
        "SELECT organization_id FROM payout_batches WHERE id=$1",
    )
    .bind(batch_id)
    .fetch_optional(pool)
    .await
    .map_err(db_error)?
    .ok_or(ApiError::NotFound)?;
    require_editor(pool, organization_id, actor).await?;
    Ok(Json(load_batch(pool, batch_id).await?))
}

async fn record_payout_submission(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(batch_id): Path<Uuid>,
    Json(body): Json<PayoutSubmissionRequest>,
) -> Result<(StatusCode, Json<PayoutBatchResponse>), ApiError> {
    let actor = require_worker_actor(&state, &headers)?;
    let pool = database_pool(&state)?;
    ensure_user(pool, actor).await?;
    let transaction_hash = hex_string(body.transaction_hash, 64, "invalid_transaction_hash")?;
    let response = if body.submission_response.is_null() {
        serde_json::json!({})
    } else {
        body.submission_response
    };
    if response
        .get("hash")
        .and_then(Value::as_str)
        .map(str::to_ascii_lowercase)
        .as_deref()
        != Some(transaction_hash.as_str())
    {
        return Err(ApiError::InvalidRequest("submission_response_hash_mismatch"));
    }

    let mut tx = pool.begin().await.map_err(db_error)?;
    let batch = load_batch_for_update(&mut tx, batch_id).await?;
    if matches!(batch.status.as_str(), "submitted" | "partial" | "confirmed") {
        if batch.submitted_transaction_hash.as_deref() != Some(transaction_hash.as_str()) {
            return Err(ApiError::Conflict("payout_batch_already_submitted"));
        }
        tx.commit().await.map_err(db_error)?;
        return Ok((StatusCode::OK, Json(load_batch(pool, batch_id).await?)));
    }
    if batch.status != "prepared" {
        return Err(ApiError::Conflict("payout_batch_not_prepared"));
    }
    sqlx::query(
        "UPDATE payout_batches SET status='submitted',submitted_transaction_hash=$2,submission_response=$3,submitted_at=now(),failure_code=NULL,updated_at=now() WHERE id=$1 AND status='prepared'",
    )
    .bind(batch_id)
    .bind(&transaction_hash)
    .bind(&response)
    .execute(&mut *tx)
    .await
    .map_err(db_error)?;
    sqlx::query(
        "UPDATE payout_transfers SET status='submitted',transaction_hash=$2,failure_code=NULL,updated_at=now() WHERE payout_batch_id=$1 AND status='pending'",
    )
    .bind(batch_id)
    .bind(&transaction_hash)
    .execute(&mut *tx)
    .await
    .map_err(db_error)?;
    audit(
        &mut tx,
        batch.organization_id,
        actor,
        "payout_batch.submit",
        "payout_batch",
        batch_id,
        serde_json::json!({
            "transaction_hash": transaction_hash,
            "worker_actor_user_id": actor,
            "network": "testnet"
        }),
    )
    .await?;
    tx.commit().await.map_err(db_error)?;
    Ok((StatusCode::OK, Json(load_batch(pool, batch_id).await?)))
}

async fn record_transfer_evidence(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(batch_id): Path<Uuid>,
    Json(body): Json<TransferEvidenceRequest>,
) -> Result<(StatusCode, Json<PayoutBatchResponse>), ApiError> {
    let actor = require_worker_actor(&state, &headers)?;
    let pool = database_pool(&state)?;
    ensure_user(pool, actor).await?;
    if body.operation_index < 0 || body.amount_minor < 0 || body.ledger_sequence <= 0 {
        return Err(ApiError::InvalidRequest("invalid_payout_evidence_numbers"));
    }
    if !(0..=7).contains(&body.asset_scale) {
        return Err(ApiError::InvalidRequest("invalid_asset_scale"));
    }
    let role = payout_role(body.role)?;
    let transaction_hash = hex_string(body.transaction_hash, 64, "invalid_transaction_hash")?;
    let source_account = account(body.source_account)?;
    let recipient_account = account(body.recipient_account)?;
    let asset_code = asset_code(body.asset_code)?;
    let asset_issuer = asset_issuer(&asset_code, body.asset_issuer)?;
    let evidence_sha256 = hash_json(&serde_json::json!({
        "role": &role,
        "transaction_hash": &transaction_hash,
        "operation_index": body.operation_index,
        "source_account": &source_account,
        "recipient_account": &recipient_account,
        "amount_minor": body.amount_minor,
        "asset_code": &asset_code,
        "asset_scale": body.asset_scale,
        "asset_issuer": &asset_issuer,
        "ledger_sequence": body.ledger_sequence,
        "successful": body.successful,
        "raw_operation": &body.raw_operation
    }))?;

    let mut tx = pool.begin().await.map_err(db_error)?;
    let batch = load_batch_for_update(&mut tx, batch_id).await?;
    let rule = sqlx::query_as::<_, PayoutRuleRecord>(
        "SELECT id,organization_id,product_id,candidate_account,organizer_account,platform_account,candidate_bps,organizer_bps,platform_bps,status,created_by_user_id,created_at,updated_at,source_account FROM payout_rules WHERE id=$1",
    )
    .bind(batch.payout_rule_id)
    .fetch_one(&mut *tx)
    .await
    .map_err(db_error)?;
    let transfer = sqlx::query_as::<_, PayoutTransferRecord>(
        "SELECT id,payout_batch_id,role,recipient_account,expected_amount_minor,status,operation_index,transaction_hash,actual_amount_minor,ledger_sequence,failure_code,confirmed_at,created_at,updated_at FROM payout_transfers WHERE payout_batch_id=$1 AND role=$2 FOR UPDATE",
    )
    .bind(batch_id)
    .bind(&role)
    .fetch_optional(&mut *tx)
    .await
    .map_err(db_error)?
    .ok_or(ApiError::NotFound)?;

    if let Some(existing) = sqlx::query_as::<_, PayoutEvidenceRecord>(
        "SELECT id,payout_transfer_id,network,transaction_hash,operation_index,source_account,recipient_account,amount_minor,asset_code,asset_scale,asset_issuer,ledger_sequence,successful,evidence_sha256,raw_operation,processing_status,reconciliation_error,created_at FROM payout_transfer_evidence WHERE network='testnet' AND transaction_hash=$1 AND operation_index=$2",
    )
    .bind(&transaction_hash)
    .bind(body.operation_index)
    .fetch_optional(&mut *tx)
    .await
    .map_err(db_error)?
    {
        if existing.payout_transfer_id != transfer.id || existing.evidence_sha256 != evidence_sha256 {
            return Err(ApiError::Conflict("payout_evidence_reused"));
        }
        tx.commit().await.map_err(db_error)?;
        let response = load_batch(pool, batch_id).await?;
        let status = if existing.processing_status == "accepted" {
            StatusCode::OK
        } else {
            StatusCode::CONFLICT
        };
        return Ok((status, Json(response)));
    }
    if transfer.status == "confirmed" {
        return Err(ApiError::Conflict("payout_transfer_already_confirmed"));
    }

    let failure = reconcile_transfer(
        &batch,
        &rule,
        &transfer,
        &transaction_hash,
        body.operation_index,
        &source_account,
        &recipient_account,
        body.amount_minor,
        &asset_code,
        body.asset_scale,
        asset_issuer.as_deref(),
        body.ledger_sequence,
        body.successful,
        &body.raw_operation,
    );
    let processing_status = if failure.is_none() { "accepted" } else { "rejected" };
    let evidence_id = Uuid::new_v4();
    sqlx::query(
        "INSERT INTO payout_transfer_evidence (id,payout_transfer_id,network,transaction_hash,operation_index,source_account,recipient_account,amount_minor,asset_code,asset_scale,asset_issuer,ledger_sequence,successful,evidence_sha256,raw_operation,processing_status,reconciliation_error) VALUES ($1,$2,'testnet',$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)",
    )
    .bind(evidence_id)
    .bind(transfer.id)
    .bind(&transaction_hash)
    .bind(body.operation_index)
    .bind(&source_account)
    .bind(&recipient_account)
    .bind(body.amount_minor)
    .bind(&asset_code)
    .bind(body.asset_scale)
    .bind(&asset_issuer)
    .bind(body.ledger_sequence)
    .bind(body.successful)
    .bind(&evidence_sha256)
    .bind(&body.raw_operation)
    .bind(processing_status)
    .bind(&failure)
    .execute(&mut *tx)
    .await
    .map_err(db_error)?;

    if failure.is_none() {
        let updated = sqlx::query(
            "UPDATE payout_transfers SET status='confirmed',operation_index=$2,transaction_hash=$3,actual_amount_minor=$4,ledger_sequence=$5,failure_code=NULL,confirmed_at=now(),updated_at=now() WHERE id=$1 AND status='submitted'",
        )
        .bind(transfer.id)
        .bind(body.operation_index)
        .bind(&transaction_hash)
        .bind(body.amount_minor)
        .bind(body.ledger_sequence)
        .execute(&mut *tx)
        .await
        .map_err(db_error)?;
        if updated.rows_affected() != 1 {
            return Err(ApiError::Conflict("payout_transfer_state_changed"));
        }
        refresh_batch_status(&mut tx, batch_id).await?;
    }
    audit(
        &mut tx,
        batch.organization_id,
        actor,
        "payout_transfer.reconcile",
        "payout_transfer_evidence",
        evidence_id,
        serde_json::json!({
            "payout_batch_id": batch_id,
            "payout_transfer_id": transfer.id,
            "role": role,
            "transaction_hash": transaction_hash,
            "operation_index": body.operation_index,
            "processing_status": processing_status,
            "reconciliation_error": failure
        }),
    )
    .await?;
    tx.commit().await.map_err(db_error)?;
    let response = load_batch(pool, batch_id).await?;
    let status = if processing_status == "accepted" {
        StatusCode::CREATED
    } else {
        StatusCode::CONFLICT
    };
    Ok((status, Json(response)))
}

async fn record_payout_failure(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(batch_id): Path<Uuid>,
    Json(body): Json<PayoutFailureRequest>,
) -> Result<Json<PayoutBatchResponse>, ApiError> {
    let actor = require_worker_actor(&state, &headers)?;
    let pool = database_pool(&state)?;
    ensure_user(pool, actor).await?;
    let failure_code = required_text(body.failure_code, 500, "invalid_payout_failure")?;
    let mut tx = pool.begin().await.map_err(db_error)?;
    let batch = load_batch_for_update(&mut tx, batch_id).await?;
    if !matches!(batch.status.as_str(), "submitted" | "partial") {
        return Err(ApiError::Conflict("payout_batch_not_in_flight"));
    }
    let next_status = if batch.confirmed_transfer_count > 0 {
        "partial"
    } else {
        "failed"
    };
    sqlx::query(
        "UPDATE payout_batches SET status=$2,failure_code=$3,updated_at=now() WHERE id=$1",
    )
    .bind(batch_id)
    .bind(next_status)
    .bind(&failure_code)
    .execute(&mut *tx)
    .await
    .map_err(db_error)?;
    sqlx::query(
        "UPDATE payout_transfers SET status='failed',failure_code=$2,updated_at=now() WHERE payout_batch_id=$1 AND status='submitted'",
    )
    .bind(batch_id)
    .bind(&failure_code)
    .execute(&mut *tx)
    .await
    .map_err(db_error)?;
    audit(
        &mut tx,
        batch.organization_id,
        actor,
        "payout_batch.fail",
        "payout_batch",
        batch_id,
        serde_json::json!({
            "failure_code": failure_code,
            "confirmed_transfer_count": batch.confirmed_transfer_count,
            "status": next_status
        }),
    )
    .await?;
    tx.commit().await.map_err(db_error)?;
    Ok(Json(load_batch(pool, batch_id).await?))
}

async fn refresh_batch_status(
    tx: &mut Transaction<'_, Postgres>,
    batch_id: Uuid,
) -> Result<(), ApiError> {
    let confirmed = sqlx::query_scalar::<_, i64>(
        "SELECT count(*) FROM payout_transfers WHERE payout_batch_id=$1 AND status='confirmed'",
    )
    .bind(batch_id)
    .fetch_one(&mut **tx)
    .await
    .map_err(db_error)?;
    let status = match confirmed {
        0 => "submitted",
        1 | 2 => "partial",
        3 => "confirmed",
        _ => return Err(ApiError::Database),
    };
    sqlx::query(
        "UPDATE payout_batches SET status=$2,confirmed_transfer_count=$3,confirmed_at=CASE WHEN $3=3 THEN now() ELSE NULL END,failure_code=NULL,updated_at=now() WHERE id=$1",
    )
    .bind(batch_id)
    .bind(status)
    .bind(confirmed as i32)
    .execute(&mut **tx)
    .await
    .map_err(db_error)?;
    Ok(())
}

async fn load_batch(pool: &PgPool, batch_id: Uuid) -> Result<PayoutBatchResponse, ApiError> {
    let batch = sqlx::query_as::<_, PayoutBatchRecord>(
        "SELECT id,organization_id,order_id,payout_rule_id,status,amount_minor,asset_code,asset_scale,asset_issuer,idempotency_key,request_sha256,expected_transfer_count,confirmed_transfer_count,submitted_transaction_hash,submission_response,submitted_at,confirmed_at,failure_code,created_by_user_id,created_at,updated_at FROM payout_batches WHERE id=$1",
    )
    .bind(batch_id)
    .fetch_optional(pool)
    .await
    .map_err(db_error)?
    .ok_or(ApiError::NotFound)?;
    let transfers = sqlx::query_as::<_, PayoutTransferRecord>(
        "SELECT id,payout_batch_id,role,recipient_account,expected_amount_minor,status,operation_index,transaction_hash,actual_amount_minor,ledger_sequence,failure_code,confirmed_at,created_at,updated_at FROM payout_transfers WHERE payout_batch_id=$1 ORDER BY CASE role WHEN 'candidate' THEN 0 WHEN 'organizer' THEN 1 ELSE 2 END",
    )
    .bind(batch_id)
    .fetch_all(pool)
    .await
    .map_err(db_error)?;
    let latest_evidence = sqlx::query_as::<_, PayoutEvidenceRecord>(
        "SELECT DISTINCT ON (pte.payout_transfer_id) pte.id,pte.payout_transfer_id,pte.network,pte.transaction_hash,pte.operation_index,pte.source_account,pte.recipient_account,pte.amount_minor,pte.asset_code,pte.asset_scale,pte.asset_issuer,pte.ledger_sequence,pte.successful,pte.evidence_sha256,pte.raw_operation,pte.processing_status,pte.reconciliation_error,pte.created_at FROM payout_transfer_evidence pte JOIN payout_transfers pt ON pt.id=pte.payout_transfer_id WHERE pt.payout_batch_id=$1 ORDER BY pte.payout_transfer_id,pte.created_at DESC",
    )
    .bind(batch_id)
    .fetch_all(pool)
    .await
    .map_err(db_error)?;
    Ok(PayoutBatchResponse {
        batch,
        transfers,
        latest_evidence,
    })
}

async fn load_batch_for_update(
    tx: &mut Transaction<'_, Postgres>,
    batch_id: Uuid,
) -> Result<PayoutBatchRecord, ApiError> {
    sqlx::query_as::<_, PayoutBatchRecord>(
        "SELECT id,organization_id,order_id,payout_rule_id,status,amount_minor,asset_code,asset_scale,asset_issuer,idempotency_key,request_sha256,expected_transfer_count,confirmed_transfer_count,submitted_transaction_hash,submission_response,submitted_at,confirmed_at,failure_code,created_by_user_id,created_at,updated_at FROM payout_batches WHERE id=$1 FOR UPDATE",
    )
    .bind(batch_id)
    .fetch_optional(&mut **tx)
    .await
    .map_err(db_error)?
    .ok_or(ApiError::NotFound)
}

#[allow(clippy::too_many_arguments)]
fn reconcile_transfer(
    batch: &PayoutBatchRecord,
    rule: &PayoutRuleRecord,
    transfer: &PayoutTransferRecord,
    transaction_hash: &str,
    operation_index: i32,
    source_account: &str,
    recipient_account: &str,
    amount_minor: i64,
    asset_code: &str,
    asset_scale: i16,
    asset_issuer: Option<&str>,
    ledger_sequence: i64,
    successful: bool,
    raw_operation: &Value,
) -> Option<String> {
    if !matches!(batch.status.as_str(), "submitted" | "partial") || transfer.status != "submitted" {
        return Some("payout_not_submitted".into());
    }
    if batch.submitted_transaction_hash.as_deref() != Some(transaction_hash) {
        return Some("transaction_hash_mismatch".into());
    }
    if source_account != rule.source_account {
        return Some("source_account_mismatch".into());
    }
    if recipient_account != transfer.recipient_account {
        return Some("recipient_account_mismatch".into());
    }
    if amount_minor != transfer.expected_amount_minor {
        return Some("amount_mismatch".into());
    }
    if asset_code != batch.asset_code
        || asset_scale != batch.asset_scale
        || asset_issuer != batch.asset_issuer.as_deref()
    {
        return Some("asset_mismatch".into());
    }
    if !successful {
        return Some("payout_failed_on_chain".into());
    }
    raw_operation_failure(
        transaction_hash,
        operation_index,
        source_account,
        recipient_account,
        amount_minor,
        asset_code,
        asset_scale,
        asset_issuer,
        ledger_sequence,
        raw_operation,
    )
}

#[allow(clippy::too_many_arguments)]
fn raw_operation_failure(
    transaction_hash: &str,
    operation_index: i32,
    source_account: &str,
    recipient_account: &str,
    amount_minor: i64,
    asset_code: &str,
    asset_scale: i16,
    asset_issuer: Option<&str>,
    ledger_sequence: i64,
    raw: &Value,
) -> Option<String> {
    if raw.get("type").and_then(Value::as_str) != Some("payment") {
        return Some("raw_operation_type_mismatch".into());
    }
    let raw_hash = raw
        .get("transaction_hash")
        .and_then(Value::as_str)
        .map(str::to_ascii_lowercase);
    if raw_hash.as_deref() != Some(transaction_hash) {
        return Some("raw_operation_transaction_hash_mismatch".into());
    }
    if raw.get("operation_index").and_then(Value::as_i64) != Some(i64::from(operation_index))
        || raw.get("ledger_sequence").and_then(Value::as_i64) != Some(ledger_sequence)
    {
        return Some("raw_operation_position_mismatch".into());
    }
    if raw.get("source_account").and_then(Value::as_str) != Some(source_account)
        || raw.get("to").and_then(Value::as_str) != Some(recipient_account)
    {
        return Some("raw_operation_account_mismatch".into());
    }
    let Some(amount) = raw.get("amount").and_then(Value::as_str) else {
        return Some("raw_operation_amount_missing".into());
    };
    if decimal_minor(amount, asset_scale) != Some(amount_minor) {
        return Some("raw_operation_amount_mismatch".into());
    }
    if asset_code == "XLM" {
        if raw.get("asset_type").and_then(Value::as_str) != Some("native") {
            return Some("raw_operation_asset_mismatch".into());
        }
    } else if raw.get("asset_code").and_then(Value::as_str) != Some(asset_code)
        || raw.get("asset_issuer").and_then(Value::as_str) != asset_issuer
    {
        return Some("raw_operation_asset_mismatch".into());
    }
    None
}

fn calculate_split(
    total: i64,
    candidate_bps: i32,
    organizer_bps: i32,
    platform_bps: i32,
) -> Result<[i64; 3], ApiError> {
    if total <= 0 {
        return Err(ApiError::InvalidRequest("invalid_payout_total"));
    }
    validate_bps(candidate_bps, organizer_bps, platform_bps)?;
    let total_i128 = i128::from(total);
    let candidate = total_i128
        .checked_mul(i128::from(candidate_bps))
        .ok_or(ApiError::InvalidRequest("payout_amount_overflow"))?
        / 10_000;
    let organizer = total_i128
        .checked_mul(i128::from(organizer_bps))
        .ok_or(ApiError::InvalidRequest("payout_amount_overflow"))?
        / 10_000;
    let platform = total_i128
        .checked_sub(candidate)
        .and_then(|value| value.checked_sub(organizer))
        .ok_or(ApiError::InvalidRequest("payout_amount_overflow"))?;
    Ok([
        i64::try_from(candidate).map_err(|_| ApiError::InvalidRequest("payout_amount_overflow"))?,
        i64::try_from(organizer).map_err(|_| ApiError::InvalidRequest("payout_amount_overflow"))?,
        i64::try_from(platform).map_err(|_| ApiError::InvalidRequest("payout_amount_overflow"))?,
    ])
}

fn validate_bps(candidate: i32, organizer: i32, platform: i32) -> Result<(), ApiError> {
    if candidate < 0
        || organizer < 0
        || platform < 0
        || candidate > 10_000
        || organizer > 10_000
        || platform > 10_000
        || candidate + organizer + platform != 10_000
    {
        Err(ApiError::InvalidRequest("invalid_payout_basis_points"))
    } else {
        Ok(())
    }
}

fn payout_rule_status(value: String) -> Result<String, ApiError> {
    let value = value.trim().to_ascii_lowercase();
    if matches!(value.as_str(), "draft" | "active" | "archived") {
        Ok(value)
    } else {
        Err(ApiError::InvalidRequest("invalid_payout_rule_status"))
    }
}

fn payout_role(value: String) -> Result<String, ApiError> {
    let value = value.trim().to_ascii_lowercase();
    if matches!(value.as_str(), "candidate" | "organizer" | "platform") {
        Ok(value)
    } else {
        Err(ApiError::InvalidRequest("invalid_payout_role"))
    }
}

fn account(value: String) -> Result<String, ApiError> {
    let value = value.trim().to_ascii_uppercase();
    validate_strkey(&value, ACCOUNT_VERSION, "invalid_stellar_account")?;
    Ok(value)
}

fn validate_strkey(value: &str, version: u8, error: &'static str) -> Result<(), ApiError> {
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
    if bits != 0 || decoded.len() != 35 || decoded[0] != version {
        return Err(ApiError::InvalidRequest(error));
    }
    let checksum = u16::from_le_bytes([decoded[33], decoded[34]]);
    if crc16(&decoded[..33]) != checksum {
        return Err(ApiError::InvalidRequest(error));
    }
    Ok(())
}

fn crc16(bytes: &[u8]) -> u16 {
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

fn asset_code(value: String) -> Result<String, ApiError> {
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

fn asset_issuer(code: &str, value: Option<String>) -> Result<Option<String>, ApiError> {
    let value = value
        .map(|value| value.trim().to_ascii_uppercase())
        .filter(|value| !value.is_empty());
    if code == "XLM" {
        if value.is_some() {
            return Err(ApiError::InvalidRequest("xlm_must_not_have_issuer"));
        }
        return Ok(None);
    }
    let issuer = value.ok_or(ApiError::InvalidRequest("asset_issuer_required"))?;
    validate_strkey(&issuer, ACCOUNT_VERSION, "invalid_asset_issuer")?;
    Ok(Some(issuer))
}

fn decimal_minor(value: &str, scale: i16) -> Option<i64> {
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
    let whole = whole.parse::<i64>().ok()?.checked_mul(factor)?;
    let padded = format!("{fraction:0<width$}", width = scale as usize);
    let fraction = if padded.is_empty() {
        0
    } else {
        padded.parse::<i64>().ok()?
    };
    whole.checked_add(fraction)
}

fn hex_string(value: String, length: usize, error: &'static str) -> Result<String, ApiError> {
    let value = value.trim().to_ascii_lowercase();
    if value.len() != length || !value.bytes().all(|byte| byte.is_ascii_hexdigit()) {
        Err(ApiError::InvalidRequest(error))
    } else {
        Ok(value)
    }
}

fn required_text(value: String, max: usize, error: &'static str) -> Result<String, ApiError> {
    let value = value.trim().to_string();
    if value.is_empty() || value.chars().count() > max {
        Err(ApiError::InvalidRequest(error))
    } else {
        Ok(value)
    }
}

fn hash_text(value: &str) -> String {
    hex::encode(Sha256::digest(value.as_bytes()))
}

fn hash_json(value: &Value) -> Result<String, ApiError> {
    let bytes = serde_json::to_vec(value)
        .map_err(|_| ApiError::InvalidRequest("invalid_payout_evidence"))?;
    Ok(hex::encode(Sha256::digest(bytes)))
}

fn database_pool(state: &AppState) -> Result<&PgPool, ApiError> {
    state
        .database
        .as_ref()
        .ok_or(ApiError::ServiceUnavailable("database_not_configured"))
}

fn require_admin_actor(state: &AppState, headers: &HeaderMap) -> Result<Uuid, ApiError> {
    require_admin(state, headers)?;
    actor_header(headers)
}

fn require_worker_actor(state: &AppState, headers: &HeaderMap) -> Result<Uuid, ApiError> {
    let expected = state
        .config
        .payout_worker_token
        .as_deref()
        .ok_or(ApiError::ServiceUnavailable("payout_worker_not_configured"))?;
    let provided = headers
        .get(WORKER_HEADER)
        .and_then(|value| value.to_str().ok())
        .ok_or(ApiError::Unauthorized)?;
    if !constant_time_equal(expected.as_bytes(), provided.as_bytes()) {
        return Err(ApiError::Unauthorized);
    }
    actor_header(headers)
}

fn actor_header(headers: &HeaderMap) -> Result<Uuid, ApiError> {
    headers
        .get("x-crownfi-user-id")
        .and_then(|value| value.to_str().ok())
        .and_then(|value| Uuid::parse_str(value).ok())
        .ok_or(ApiError::Unauthorized)
}

fn constant_time_equal(left: &[u8], right: &[u8]) -> bool {
    let max = left.len().max(right.len());
    let mut difference = left.len() ^ right.len();
    for index in 0..max {
        let left_byte = left.get(index).copied().unwrap_or(0);
        let right_byte = right.get(index).copied().unwrap_or(0);
        difference |= usize::from(left_byte ^ right_byte);
    }
    difference == 0
}

async fn ensure_user(pool: &PgPool, user_id: Uuid) -> Result<(), ApiError> {
    let exists = sqlx::query_scalar::<_, bool>("SELECT EXISTS (SELECT 1 FROM users WHERE id=$1)")
        .bind(user_id)
        .fetch_one(pool)
        .await
        .map_err(db_error)?;
    if exists {
        Ok(())
    } else {
        Err(ApiError::Unauthorized)
    }
}

async fn require_editor(pool: &PgPool, organization_id: Uuid, user_id: Uuid) -> Result<(), ApiError> {
    let allowed = sqlx::query_scalar::<_, bool>(
        "SELECT EXISTS (SELECT 1 FROM organization_members WHERE organization_id=$1 AND user_id=$2 AND status='active' AND role IN ('owner','admin','editor'))",
    )
    .bind(organization_id)
    .bind(user_id)
    .fetch_one(pool)
    .await
    .map_err(db_error)?;
    if allowed {
        Ok(())
    } else {
        Err(ApiError::Forbidden)
    }
}

async fn require_editor_tx(
    tx: &mut Transaction<'_, Postgres>,
    organization_id: Uuid,
    user_id: Uuid,
) -> Result<(), ApiError> {
    let allowed = sqlx::query_scalar::<_, bool>(
        "SELECT EXISTS (SELECT 1 FROM organization_members WHERE organization_id=$1 AND user_id=$2 AND status='active' AND role IN ('owner','admin','editor'))",
    )
    .bind(organization_id)
    .bind(user_id)
    .fetch_one(&mut **tx)
    .await
    .map_err(db_error)?;
    if allowed {
        Ok(())
    } else {
        Err(ApiError::Forbidden)
    }
}

async fn audit(
    tx: &mut Transaction<'_, Postgres>,
    organization_id: Uuid,
    actor_user_id: Uuid,
    action: &str,
    entity_type: &str,
    entity_id: Uuid,
    metadata: Value,
) -> Result<(), ApiError> {
    sqlx::query(
        "INSERT INTO audit_logs (id,organization_id,actor_user_id,action,entity_type,entity_id,metadata) VALUES ($1,$2,$3,$4,$5,$6,$7)",
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
    .map_err(db_error)?;
    Ok(())
}

fn db_error(error: sqlx::Error) -> ApiError {
    if let Some(database_error) = error.as_database_error() {
        let code = database_error.code().map(|code| code.into_owned());
        return match code.as_deref() {
            Some("23505") => ApiError::Conflict("resource_already_exists"),
            Some("23503") => ApiError::InvalidRequest("related_resource_not_found"),
            Some("23514") | Some("22P02") | Some("22003") => {
                ApiError::InvalidRequest("database_constraint_failed")
            }
            _ => {
                tracing::error!(%error, "payout database operation failed");
                ApiError::Database
            }
        };
    }
    tracing::error!(%error, "payout database operation failed");
    ApiError::Database
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn split_is_exact_and_platform_absorbs_remainder() {
        let split = calculate_split(10_000_001, 7000, 2000, 1000).unwrap();
        assert_eq!(split, [7_000_000, 2_000_000, 1_000_001]);
        assert_eq!(split.iter().sum::<i64>(), 10_000_001);
    }

    #[test]
    fn rejects_invalid_basis_points() {
        assert!(validate_bps(7000, 2000, 1000).is_ok());
        assert!(validate_bps(7000, 2000, 999).is_err());
    }

    #[test]
    fn worker_token_comparison_is_length_sensitive() {
        assert!(constant_time_equal(b"token", b"token"));
        assert!(!constant_time_equal(b"token", b"token2"));
        assert!(!constant_time_equal(b"token", b"tokeN"));
    }
}
