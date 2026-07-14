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
use time::{Duration, OffsetDateTime};
use uuid::Uuid;

use crate::{app::require_admin, error::ApiError, state::AppState};

const ACCOUNT_VERSION: u8 = 48;
const CONTRACT_VERSION: u8 = 16;

pub fn router() -> Router<AppState> {
    Router::new()
        .route(
            "/admin/platform/orders/:order_id/fulfillment-jobs",
            post(create_fulfillment_job),
        )
        .route(
            "/admin/platform/fulfillment-jobs/:job_id",
            get(get_fulfillment_job),
        )
        .route(
            "/admin/platform/fulfillment-jobs/:job_id/claim",
            post(claim_fulfillment_job),
        )
        .route(
            "/admin/platform/fulfillment-jobs/:job_id/submission",
            post(record_mint_submission),
        )
        .route(
            "/admin/platform/fulfillment-jobs/:job_id/failure",
            post(record_fulfillment_failure),
        )
        .route(
            "/admin/platform/fulfillment-jobs/:job_id/mint-evidence",
            post(record_mint_evidence),
        )
}

#[derive(Debug, Clone, Serialize, FromRow)]
pub struct FulfillmentJobRecord {
    pub id: Uuid,
    pub organization_id: Uuid,
    pub order_id: Uuid,
    pub order_item_id: Uuid,
    pub kind: String,
    pub status: String,
    pub idempotency_key: String,
    pub payload_sha256: String,
    pub payload: Value,
    pub attempts: i32,
    pub max_attempts: i32,
    pub available_at: OffsetDateTime,
    pub locked_at: Option<OffsetDateTime>,
    pub locked_by: Option<String>,
    pub last_error: Option<String>,
    pub created_by_user_id: Uuid,
    pub created_at: OffsetDateTime,
    pub updated_at: OffsetDateTime,
}

#[derive(Debug, Clone, Serialize, FromRow)]
pub struct CollectibleMintRecord {
    pub id: Uuid,
    pub fulfillment_job_id: Uuid,
    pub order_item_id: Uuid,
    pub collectible_edition_id: Uuid,
    pub contract_id: String,
    pub recipient_account: String,
    pub metadata_sha256: String,
    pub mint_reference_sha256: String,
    pub token_id: Option<String>,
    pub transaction_hash: Option<String>,
    pub status: String,
    pub submission_response: Option<Value>,
    pub failure_code: Option<String>,
    pub submitted_at: Option<OffsetDateTime>,
    pub confirmed_at: Option<OffsetDateTime>,
    pub created_at: OffsetDateTime,
    pub updated_at: OffsetDateTime,
}

#[derive(Debug, Clone, Serialize, FromRow)]
pub struct MintEvidenceRecord {
    pub id: Uuid,
    pub collectible_mint_id: Uuid,
    pub network: String,
    pub transaction_hash: String,
    pub contract_id: String,
    pub token_id: String,
    pub owner_account: String,
    pub ledger_sequence: i64,
    pub event_index: i32,
    pub successful: bool,
    pub evidence_sha256: String,
    pub raw_event: Value,
    pub processing_status: String,
    pub reconciliation_error: Option<String>,
    pub created_at: OffsetDateTime,
}

#[derive(Debug, Clone, Serialize, FromRow)]
pub struct OwnershipProjectionRecord {
    pub id: Uuid,
    pub network: String,
    pub contract_id: String,
    pub token_id: String,
    pub owner_account: String,
    pub collectible_mint_id: Uuid,
    pub source_transaction_hash: String,
    pub ledger_sequence: i64,
    pub event_index: i32,
    pub raw_event: Value,
    pub created_at: OffsetDateTime,
    pub updated_at: OffsetDateTime,
}

#[derive(Debug, Clone, Serialize)]
pub struct FulfillmentResponse {
    pub job: FulfillmentJobRecord,
    pub mint: CollectibleMintRecord,
    pub latest_evidence: Option<MintEvidenceRecord>,
    pub ownership: Option<OwnershipProjectionRecord>,
    pub order_status: String,
}

#[derive(Debug, Deserialize)]
pub struct CreateFulfillmentRequest {
    pub recipient_account: String,
    pub idempotency_key: String,
    pub max_attempts: Option<i32>,
}

#[derive(Debug, Deserialize)]
pub struct ClaimFulfillmentRequest {
    pub worker_id: String,
}

#[derive(Debug, Deserialize)]
pub struct MintSubmissionRequest {
    pub worker_id: String,
    pub transaction_hash: String,
    pub token_id: String,
    #[serde(default)]
    pub submission_response: Value,
}

#[derive(Debug, Deserialize)]
pub struct FulfillmentFailureRequest {
    pub worker_id: String,
    pub error_code: String,
    pub retryable: bool,
    pub retry_after_seconds: Option<i64>,
}

#[derive(Debug, Deserialize)]
pub struct MintEvidenceRequest {
    pub transaction_hash: String,
    pub contract_id: String,
    pub token_id: String,
    pub owner_account: String,
    pub ledger_sequence: i64,
    pub event_index: i32,
    pub successful: bool,
    pub raw_event: Value,
}

#[derive(Debug, FromRow)]
struct FulfillmentSource {
    organization_id: Uuid,
    buyer_user_id: Uuid,
    order_status: String,
    environment: String,
    order_item_id: Uuid,
    product_id: Uuid,
    quantity: i64,
    product_kind: String,
    collectible_edition_id: Uuid,
    contract_id: Option<String>,
    metadata_sha256: Option<String>,
    mint_policy: String,
}

async fn create_fulfillment_job(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(order_id): Path<Uuid>,
    Json(body): Json<CreateFulfillmentRequest>,
) -> Result<(StatusCode, Json<FulfillmentResponse>), ApiError> {
    let actor_user_id = require_admin_actor(&state, &headers)?;
    let pool = database_pool(&state)?;
    let recipient_account = stellar_account(body.recipient_account)?;
    let idempotency_key = required_text(
        body.idempotency_key,
        200,
        "invalid_fulfillment_idempotency_key",
    )?;
    let max_attempts = body.max_attempts.unwrap_or(5);
    if !(1..=20).contains(&max_attempts) {
        return Err(ApiError::InvalidRequest("invalid_max_attempts"));
    }

    let mut tx = pool.begin().await.map_err(db_error)?;
    let sources = sqlx::query_as::<_, FulfillmentSource>(
        "SELECT o.organization_id,o.buyer_user_id,o.status AS order_status,o.environment,oi.id AS order_item_id,oi.product_id,oi.quantity,p.kind AS product_kind,ce.id AS collectible_edition_id,COALESCE(ce.contract_id,cc.contract_id) AS contract_id,COALESCE(ce.metadata_sha256,cc.metadata_sha256) AS metadata_sha256,ce.mint_policy FROM orders o JOIN order_items oi ON oi.order_id=o.id JOIN products p ON p.id=oi.product_id JOIN collectible_editions ce ON ce.product_id=p.id JOIN collectible_collections cc ON cc.id=ce.collection_id WHERE o.id=$1 FOR UPDATE OF o,oi,p,ce,cc",
    )
    .bind(order_id)
    .fetch_all(&mut *tx)
    .await
    .map_err(db_error)?;
    if sources.is_empty() {
        return Err(ApiError::NotFound);
    }
    if sources.len() != 1 {
        return Err(ApiError::Conflict("one_collectible_item_required"));
    }
    let source = &sources[0];
    require_editor_tx(&mut tx, source.organization_id, actor_user_id).await?;
    if source.environment != "testnet" {
        return Err(ApiError::InvalidRequest("fulfillment_requires_testnet"));
    }
    if source.product_kind != "collectible" || source.quantity != 1 {
        return Err(ApiError::Conflict("one_collectible_item_required"));
    }
    if source.mint_policy != "on_purchase" {
        return Err(ApiError::Conflict("collectible_not_minted_on_purchase"));
    }
    let contract_id = source
        .contract_id
        .as_deref()
        .ok_or(ApiError::Conflict("collectible_contract_not_configured"))?;
    validate_strkey(contract_id, CONTRACT_VERSION, "invalid_contract_id")?;
    let metadata_sha256 = source
        .metadata_sha256
        .as_deref()
        .ok_or(ApiError::Conflict("collectible_metadata_not_finalized"))?;
    validate_hex(metadata_sha256, 64, "invalid_metadata_sha256")?;

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
    let wallet_verified = sqlx::query_scalar::<_, bool>(
        "SELECT EXISTS (SELECT 1 FROM stellar_accounts WHERE user_id=$1 AND network='testnet' AND address=$2 AND verified_at IS NOT NULL)",
    )
    .bind(source.buyer_user_id)
    .bind(&recipient_account)
    .fetch_one(&mut *tx)
    .await
    .map_err(db_error)?;
    if !wallet_verified {
        return Err(ApiError::Conflict("verified_buyer_testnet_wallet_required"));
    }

    let payload = serde_json::json!({
        "order_id": order_id,
        "order_item_id": source.order_item_id,
        "product_id": source.product_id,
        "collectible_edition_id": source.collectible_edition_id,
        "contract_id": contract_id,
        "recipient_account": &recipient_account,
        "metadata_sha256": metadata_sha256,
        "quantity": 1,
        "network": "testnet"
    });
    let payload_sha256 = hash_json(&payload)?;

    if let Some((existing_id, existing_hash)) = sqlx::query_as::<_, (Uuid, String)>(
        "SELECT id,payload_sha256 FROM fulfillment_jobs WHERE organization_id=$1 AND idempotency_key=$2 FOR UPDATE",
    )
    .bind(source.organization_id)
    .bind(&idempotency_key)
    .fetch_optional(&mut *tx)
    .await
    .map_err(db_error)?
    {
        if existing_hash != payload_sha256 {
            return Err(ApiError::Conflict("idempotency_key_reused"));
        }
        tx.commit().await.map_err(db_error)?;
        return Ok((StatusCode::OK, Json(load_fulfillment(pool, existing_id).await?)));
    }

    if source.order_status != "paid" {
        return Err(ApiError::Conflict("order_not_paid"));
    }

    let job_id = Uuid::new_v4();
    let mint_id = Uuid::new_v4();
    let mint_reference_sha256 = hash_text(&format!(
        "network=testnet;order_item={};edition={};contract={contract_id};recipient={recipient_account};metadata={metadata_sha256}",
        source.order_item_id, source.collectible_edition_id
    ));

    sqlx::query(
        "INSERT INTO fulfillment_jobs (id,organization_id,order_id,order_item_id,kind,status,idempotency_key,payload_sha256,payload,max_attempts,created_by_user_id) VALUES ($1,$2,$3,$4,'collectible_mint','queued',$5,$6,$7,$8,$9)",
    )
    .bind(job_id)
    .bind(source.organization_id)
    .bind(order_id)
    .bind(source.order_item_id)
    .bind(&idempotency_key)
    .bind(&payload_sha256)
    .bind(&payload)
    .bind(max_attempts)
    .bind(actor_user_id)
    .execute(&mut *tx)
    .await
    .map_err(db_error)?;
    sqlx::query(
        "INSERT INTO collectible_mints (id,fulfillment_job_id,order_item_id,collectible_edition_id,contract_id,recipient_account,metadata_sha256,mint_reference_sha256,status) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'queued')",
    )
    .bind(mint_id)
    .bind(job_id)
    .bind(source.order_item_id)
    .bind(source.collectible_edition_id)
    .bind(contract_id)
    .bind(&recipient_account)
    .bind(metadata_sha256)
    .bind(&mint_reference_sha256)
    .execute(&mut *tx)
    .await
    .map_err(db_error)?;
    let order_update = sqlx::query(
        "UPDATE orders SET status='fulfilling',updated_at=now() WHERE id=$1 AND status='paid'",
    )
    .bind(order_id)
    .execute(&mut *tx)
    .await
    .map_err(db_error)?;
    if order_update.rows_affected() != 1 {
        return Err(ApiError::Conflict("order_state_changed"));
    }
    audit(
        &mut tx,
        source.organization_id,
        actor_user_id,
        "collectible_fulfillment.queue",
        "fulfillment_job",
        job_id,
        serde_json::json!({
            "collectible_mint_id": mint_id,
            "order_id": order_id,
            "order_item_id": source.order_item_id,
            "contract_id": contract_id,
            "recipient_account": recipient_account,
            "mint_reference_sha256": mint_reference_sha256
        }),
    )
    .await?;
    tx.commit().await.map_err(db_error)?;

    Ok((
        StatusCode::CREATED,
        Json(load_fulfillment(pool, job_id).await?),
    ))
}

async fn get_fulfillment_job(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(job_id): Path<Uuid>,
) -> Result<Json<FulfillmentResponse>, ApiError> {
    let actor_user_id = require_admin_actor(&state, &headers)?;
    let pool = database_pool(&state)?;
    let organization_id =
        sqlx::query_scalar::<_, Uuid>("SELECT organization_id FROM fulfillment_jobs WHERE id=$1")
            .bind(job_id)
            .fetch_optional(pool)
            .await
            .map_err(db_error)?
            .ok_or(ApiError::NotFound)?;
    require_editor(pool, organization_id, actor_user_id).await?;
    Ok(Json(load_fulfillment(pool, job_id).await?))
}

async fn claim_fulfillment_job(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(job_id): Path<Uuid>,
    Json(body): Json<ClaimFulfillmentRequest>,
) -> Result<Json<FulfillmentResponse>, ApiError> {
    let actor_user_id = require_admin_actor(&state, &headers)?;
    let worker_id = required_text(body.worker_id, 160, "invalid_worker_id")?;
    let pool = database_pool(&state)?;
    let mut tx = pool.begin().await.map_err(db_error)?;
    let job = load_job_for_update(&mut tx, job_id).await?;
    require_editor_tx(&mut tx, job.organization_id, actor_user_id).await?;

    if job.status == "running" && job.locked_by.as_deref() == Some(worker_id.as_str()) {
        tx.commit().await.map_err(db_error)?;
        return Ok(Json(load_fulfillment(pool, job_id).await?));
    }
    if !matches!(job.status.as_str(), "queued" | "failed") {
        return Err(ApiError::Conflict("fulfillment_job_not_claimable"));
    }
    if job.available_at > OffsetDateTime::now_utc() {
        return Err(ApiError::Conflict("fulfillment_job_not_available"));
    }
    if job.attempts >= job.max_attempts {
        sqlx::query(
            "UPDATE fulfillment_jobs SET status='dead_letter',last_error='max_attempts_exhausted',locked_at=NULL,locked_by=NULL,updated_at=now() WHERE id=$1",
        )
        .bind(job_id)
        .execute(&mut *tx)
        .await
        .map_err(db_error)?;
        tx.commit().await.map_err(db_error)?;
        return Err(ApiError::Conflict("fulfillment_attempts_exhausted"));
    }

    sqlx::query(
        "UPDATE fulfillment_jobs SET status='running',attempts=attempts+1,locked_at=now(),locked_by=$2,last_error=NULL,updated_at=now() WHERE id=$1",
    )
    .bind(job_id)
    .bind(&worker_id)
    .execute(&mut *tx)
    .await
    .map_err(db_error)?;
    sqlx::query(
        "UPDATE collectible_mints SET status='queued',failure_code=NULL,updated_at=now() WHERE fulfillment_job_id=$1 AND status='failed'",
    )
    .bind(job_id)
    .execute(&mut *tx)
    .await
    .map_err(db_error)?;
    tx.commit().await.map_err(db_error)?;
    Ok(Json(load_fulfillment(pool, job_id).await?))
}

async fn record_mint_submission(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(job_id): Path<Uuid>,
    Json(body): Json<MintSubmissionRequest>,
) -> Result<Json<FulfillmentResponse>, ApiError> {
    let actor_user_id = require_admin_actor(&state, &headers)?;
    let worker_id = required_text(body.worker_id, 160, "invalid_worker_id")?;
    let transaction_hash = hex_string(body.transaction_hash, 64, "invalid_transaction_hash")?;
    let token_id = required_text(body.token_id, 160, "invalid_token_id")?;
    let response = if body.submission_response.is_null() {
        serde_json::json!({})
    } else {
        body.submission_response
    };
    let pool = database_pool(&state)?;
    let mut tx = pool.begin().await.map_err(db_error)?;
    let job = load_job_for_update(&mut tx, job_id).await?;
    require_editor_tx(&mut tx, job.organization_id, actor_user_id).await?;
    let mint = load_mint_for_update(&mut tx, job_id).await?;

    if job.status == "awaiting_chain"
        && mint.status == "submitted"
        && mint.transaction_hash.as_deref() == Some(transaction_hash.as_str())
        && mint.token_id.as_deref() == Some(token_id.as_str())
    {
        tx.commit().await.map_err(db_error)?;
        return Ok(Json(load_fulfillment(pool, job_id).await?));
    }
    if job.status != "running" || job.locked_by.as_deref() != Some(worker_id.as_str()) {
        return Err(ApiError::Conflict("fulfillment_job_not_owned_by_worker"));
    }
    if mint.status != "queued" {
        return Err(ApiError::Conflict("collectible_mint_not_queued"));
    }

    sqlx::query(
        "UPDATE collectible_mints SET token_id=$2,transaction_hash=$3,status='submitted',submission_response=$4,submitted_at=now(),failure_code=NULL,updated_at=now() WHERE id=$1 AND status='queued'",
    )
    .bind(mint.id)
    .bind(&token_id)
    .bind(&transaction_hash)
    .bind(&response)
    .execute(&mut *tx)
    .await
    .map_err(db_error)?;
    sqlx::query(
        "UPDATE fulfillment_jobs SET status='awaiting_chain',locked_at=NULL,locked_by=NULL,last_error=NULL,updated_at=now() WHERE id=$1 AND status='running'",
    )
    .bind(job_id)
    .execute(&mut *tx)
    .await
    .map_err(db_error)?;
    audit(
        &mut tx,
        job.organization_id,
        actor_user_id,
        "collectible_mint.submit",
        "collectible_mint",
        mint.id,
        serde_json::json!({
            "fulfillment_job_id": job_id,
            "transaction_hash": transaction_hash,
            "token_id": token_id,
            "worker_id": worker_id,
            "network": "testnet"
        }),
    )
    .await?;
    tx.commit().await.map_err(db_error)?;
    Ok(Json(load_fulfillment(pool, job_id).await?))
}

async fn record_fulfillment_failure(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(job_id): Path<Uuid>,
    Json(body): Json<FulfillmentFailureRequest>,
) -> Result<Json<FulfillmentResponse>, ApiError> {
    let actor_user_id = require_admin_actor(&state, &headers)?;
    let worker_id = required_text(body.worker_id, 160, "invalid_worker_id")?;
    let error_code = required_text(body.error_code, 500, "invalid_fulfillment_error")?;
    let retry_after = body.retry_after_seconds.unwrap_or(30);
    if !(0..=86_400).contains(&retry_after) {
        return Err(ApiError::InvalidRequest("invalid_retry_after"));
    }
    let pool = database_pool(&state)?;
    let mut tx = pool.begin().await.map_err(db_error)?;
    let job = load_job_for_update(&mut tx, job_id).await?;
    require_editor_tx(&mut tx, job.organization_id, actor_user_id).await?;
    if job.status != "running" || job.locked_by.as_deref() != Some(worker_id.as_str()) {
        return Err(ApiError::Conflict("fulfillment_job_not_owned_by_worker"));
    }

    let will_retry = body.retryable && job.attempts < job.max_attempts;
    let next_status = if will_retry { "failed" } else { "dead_letter" };
    let available_at = OffsetDateTime::now_utc() + Duration::seconds(retry_after);
    sqlx::query(
        "UPDATE fulfillment_jobs SET status=$2,available_at=$3,locked_at=NULL,locked_by=NULL,last_error=$4,updated_at=now() WHERE id=$1",
    )
    .bind(job_id)
    .bind(next_status)
    .bind(available_at)
    .bind(&error_code)
    .execute(&mut *tx)
    .await
    .map_err(db_error)?;
    sqlx::query(
        "UPDATE collectible_mints SET status='failed',failure_code=$2,updated_at=now() WHERE fulfillment_job_id=$1 AND status='queued'",
    )
    .bind(job_id)
    .bind(&error_code)
    .execute(&mut *tx)
    .await
    .map_err(db_error)?;
    if !will_retry {
        sqlx::query("UPDATE orders SET status='failed',updated_at=now() WHERE id=$1 AND status='fulfilling'")
            .bind(job.order_id)
            .execute(&mut *tx)
            .await
            .map_err(db_error)?;
    }
    audit(
        &mut tx,
        job.organization_id,
        actor_user_id,
        "collectible_fulfillment.fail",
        "fulfillment_job",
        job_id,
        serde_json::json!({
            "worker_id": worker_id,
            "error_code": error_code,
            "retryable": will_retry,
            "attempts": job.attempts,
            "max_attempts": job.max_attempts
        }),
    )
    .await?;
    tx.commit().await.map_err(db_error)?;
    Ok(Json(load_fulfillment(pool, job_id).await?))
}

async fn record_mint_evidence(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(job_id): Path<Uuid>,
    Json(body): Json<MintEvidenceRequest>,
) -> Result<(StatusCode, Json<FulfillmentResponse>), ApiError> {
    let actor_user_id = require_admin_actor(&state, &headers)?;
    if body.ledger_sequence <= 0 || body.event_index < 0 {
        return Err(ApiError::InvalidRequest("invalid_mint_evidence_numbers"));
    }
    let transaction_hash = hex_string(body.transaction_hash, 64, "invalid_transaction_hash")?;
    let contract_id = stellar_contract(body.contract_id)?;
    let token_id = required_text(body.token_id, 160, "invalid_token_id")?;
    let owner_account = stellar_account(body.owner_account)?;
    let evidence_sha256 = hash_json(&serde_json::json!({
        "transaction_hash": &transaction_hash,
        "contract_id": &contract_id,
        "token_id": &token_id,
        "owner_account": &owner_account,
        "ledger_sequence": body.ledger_sequence,
        "event_index": body.event_index,
        "successful": body.successful,
        "raw_event": &body.raw_event
    }))?;

    let pool = database_pool(&state)?;
    let mut tx = pool.begin().await.map_err(db_error)?;
    let job = load_job_for_update(&mut tx, job_id).await?;
    require_editor_tx(&mut tx, job.organization_id, actor_user_id).await?;
    let mint = load_mint_for_update(&mut tx, job_id).await?;

    if let Some(existing) = sqlx::query_as::<_, MintEvidenceRecord>(
        "SELECT id,collectible_mint_id,network,transaction_hash,contract_id,token_id,owner_account,ledger_sequence,event_index,successful,evidence_sha256,raw_event,processing_status,reconciliation_error,created_at FROM collectible_mint_evidence WHERE network='testnet' AND transaction_hash=$1 AND event_index=$2",
    )
    .bind(&transaction_hash)
    .bind(body.event_index)
    .fetch_optional(&mut *tx)
    .await
    .map_err(db_error)?
    {
        if existing.collectible_mint_id != mint.id || existing.evidence_sha256 != evidence_sha256 {
            return Err(ApiError::Conflict("mint_evidence_reused"));
        }
        tx.commit().await.map_err(db_error)?;
        let response = load_fulfillment(pool, job_id).await?;
        let status = if existing.processing_status == "accepted" {
            StatusCode::OK
        } else {
            StatusCode::CONFLICT
        };
        return Ok((status, Json(response)));
    }

    let failure = reconcile_mint_evidence(
        &job,
        &mint,
        &transaction_hash,
        &contract_id,
        &token_id,
        &owner_account,
        body.ledger_sequence,
        body.successful,
        &body.raw_event,
    );
    let processing_status = if failure.is_none() {
        "accepted"
    } else {
        "rejected"
    };
    let evidence_id = Uuid::new_v4();
    sqlx::query(
        "INSERT INTO collectible_mint_evidence (id,collectible_mint_id,network,transaction_hash,contract_id,token_id,owner_account,ledger_sequence,event_index,successful,evidence_sha256,raw_event,processing_status,reconciliation_error) VALUES ($1,$2,'testnet',$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)",
    )
    .bind(evidence_id)
    .bind(mint.id)
    .bind(&transaction_hash)
    .bind(&contract_id)
    .bind(&token_id)
    .bind(&owner_account)
    .bind(body.ledger_sequence)
    .bind(body.event_index)
    .bind(body.successful)
    .bind(&evidence_sha256)
    .bind(&body.raw_event)
    .bind(processing_status)
    .bind(&failure)
    .execute(&mut *tx)
    .await
    .map_err(db_error)?;

    if failure.is_none() {
        if sqlx::query_scalar::<_, bool>(
            "SELECT EXISTS (SELECT 1 FROM collectible_mint_evidence WHERE collectible_mint_id=$1 AND processing_status='accepted' AND id<>$2)",
        )
        .bind(mint.id)
        .bind(evidence_id)
        .fetch_one(&mut *tx)
        .await
        .map_err(db_error)?
        {
            return Err(ApiError::Conflict("collectible_mint_already_confirmed"));
        }
        confirm_mint(
            &mut tx,
            &job,
            &mint,
            evidence_id,
            &transaction_hash,
            &contract_id,
            &token_id,
            &owner_account,
            body.ledger_sequence,
            body.event_index,
            &body.raw_event,
        )
        .await?;
    }

    audit(
        &mut tx,
        job.organization_id,
        actor_user_id,
        "collectible_mint.reconcile",
        "collectible_mint_evidence",
        evidence_id,
        serde_json::json!({
            "collectible_mint_id": mint.id,
            "transaction_hash": transaction_hash,
            "contract_id": contract_id,
            "token_id": token_id,
            "owner_account": owner_account,
            "ledger_sequence": body.ledger_sequence,
            "event_index": body.event_index,
            "processing_status": processing_status,
            "reconciliation_error": failure
        }),
    )
    .await?;
    tx.commit().await.map_err(db_error)?;

    let response = load_fulfillment(pool, job_id).await?;
    let status = if processing_status == "accepted" {
        StatusCode::CREATED
    } else {
        StatusCode::CONFLICT
    };
    Ok((status, Json(response)))
}

#[allow(clippy::too_many_arguments)]
async fn confirm_mint(
    tx: &mut Transaction<'_, Postgres>,
    job: &FulfillmentJobRecord,
    mint: &CollectibleMintRecord,
    _evidence_id: Uuid,
    transaction_hash: &str,
    contract_id: &str,
    token_id: &str,
    owner_account: &str,
    ledger_sequence: i64,
    event_index: i32,
    raw_event: &Value,
) -> Result<(), ApiError> {
    let mint_update = sqlx::query(
        "UPDATE collectible_mints SET status='confirmed',confirmed_at=now(),failure_code=NULL,updated_at=now() WHERE id=$1 AND status='submitted'",
    )
    .bind(mint.id)
    .execute(&mut **tx)
    .await
    .map_err(db_error)?;
    let job_update = sqlx::query(
        "UPDATE fulfillment_jobs SET status='fulfilled',locked_at=NULL,locked_by=NULL,last_error=NULL,updated_at=now() WHERE id=$1 AND status='awaiting_chain'",
    )
    .bind(job.id)
    .execute(&mut **tx)
    .await
    .map_err(db_error)?;
    if mint_update.rows_affected() != 1 || job_update.rows_affected() != 1 {
        return Err(ApiError::Conflict("collectible_mint_state_changed"));
    }

    sqlx::query(
        "INSERT INTO ownership_projections (id,network,contract_id,token_id,owner_account,collectible_mint_id,source_transaction_hash,ledger_sequence,event_index,raw_event) VALUES ($1,'testnet',$2,$3,$4,$5,$6,$7,$8,$9)",
    )
    .bind(Uuid::new_v4())
    .bind(contract_id)
    .bind(token_id)
    .bind(owner_account)
    .bind(mint.id)
    .bind(transaction_hash)
    .bind(ledger_sequence)
    .bind(event_index)
    .bind(raw_event)
    .execute(&mut **tx)
    .await
    .map_err(db_error)?;

    let inventory = sqlx::query(
        "UPDATE product_inventory pi SET reserved_quantity=reserved_quantity-oi.quantity,fulfilled_quantity=fulfilled_quantity+oi.quantity,updated_at=now() FROM order_items oi WHERE oi.id=$1 AND pi.product_id=oi.product_id AND pi.reserved_quantity>=oi.quantity",
    )
    .bind(job.order_item_id)
    .execute(&mut **tx)
    .await
    .map_err(db_error)?;
    if inventory.rows_affected() != 1 {
        return Err(ApiError::Conflict("inventory_fulfillment_state_changed"));
    }

    let remaining = sqlx::query_scalar::<_, i64>(
        "SELECT count(*) FROM fulfillment_jobs WHERE order_id=$1 AND status<>'fulfilled'",
    )
    .bind(job.order_id)
    .fetch_one(&mut **tx)
    .await
    .map_err(db_error)?;
    if remaining == 0 {
        let order = sqlx::query(
            "UPDATE orders SET status='fulfilled',updated_at=now() WHERE id=$1 AND status='fulfilling'",
        )
        .bind(job.order_id)
        .execute(&mut **tx)
        .await
        .map_err(db_error)?;
        if order.rows_affected() != 1 {
            return Err(ApiError::Conflict("order_fulfillment_state_changed"));
        }
    }
    Ok(())
}

#[allow(clippy::too_many_arguments)]
fn reconcile_mint_evidence(
    job: &FulfillmentJobRecord,
    mint: &CollectibleMintRecord,
    transaction_hash: &str,
    contract_id: &str,
    token_id: &str,
    owner_account: &str,
    ledger_sequence: i64,
    successful: bool,
    raw_event: &Value,
) -> Option<String> {
    if job.status != "awaiting_chain" || mint.status != "submitted" {
        return Some("mint_not_submitted".into());
    }
    if mint.transaction_hash.as_deref() != Some(transaction_hash) {
        return Some("transaction_hash_mismatch".into());
    }
    if mint.contract_id != contract_id {
        return Some("contract_id_mismatch".into());
    }
    if mint.token_id.as_deref() != Some(token_id) {
        return Some("token_id_mismatch".into());
    }
    if mint.recipient_account != owner_account {
        return Some("owner_account_mismatch".into());
    }
    if !successful {
        return Some("mint_failed_on_chain".into());
    }
    raw_event_failure(
        transaction_hash,
        contract_id,
        token_id,
        owner_account,
        ledger_sequence,
        successful,
        raw_event,
    )
}

fn raw_event_failure(
    transaction_hash: &str,
    contract_id: &str,
    token_id: &str,
    owner_account: &str,
    ledger_sequence: i64,
    successful: bool,
    raw: &Value,
) -> Option<String> {
    if raw.get("event_type").and_then(Value::as_str) != Some("mint") {
        return Some("raw_mint_event_type_mismatch".into());
    }
    let raw_hash = raw
        .get("transaction_hash")
        .and_then(Value::as_str)
        .map(str::to_ascii_lowercase);
    if raw_hash.as_deref() != Some(transaction_hash) {
        return Some("raw_mint_transaction_hash_mismatch".into());
    }
    if raw.get("contract_id").and_then(Value::as_str) != Some(contract_id)
        || raw.get("token_id").and_then(Value::as_str) != Some(token_id)
        || raw.get("owner_account").and_then(Value::as_str) != Some(owner_account)
    {
        return Some("raw_mint_identity_mismatch".into());
    }
    if raw.get("ledger_sequence").and_then(Value::as_i64) != Some(ledger_sequence)
        || raw.get("successful").and_then(Value::as_bool) != Some(successful)
    {
        return Some("raw_mint_result_mismatch".into());
    }
    None
}

async fn load_fulfillment(pool: &PgPool, job_id: Uuid) -> Result<FulfillmentResponse, ApiError> {
    let job = sqlx::query_as::<_, FulfillmentJobRecord>(
        "SELECT id,organization_id,order_id,order_item_id,kind,status,idempotency_key,payload_sha256,payload,attempts,max_attempts,available_at,locked_at,locked_by,last_error,created_by_user_id,created_at,updated_at FROM fulfillment_jobs WHERE id=$1",
    )
    .bind(job_id)
    .fetch_optional(pool)
    .await
    .map_err(db_error)?
    .ok_or(ApiError::NotFound)?;
    let mint = sqlx::query_as::<_, CollectibleMintRecord>(
        "SELECT id,fulfillment_job_id,order_item_id,collectible_edition_id,contract_id,recipient_account,metadata_sha256,mint_reference_sha256,token_id,transaction_hash,status,submission_response,failure_code,submitted_at,confirmed_at,created_at,updated_at FROM collectible_mints WHERE fulfillment_job_id=$1",
    )
    .bind(job_id)
    .fetch_one(pool)
    .await
    .map_err(db_error)?;
    let latest_evidence = sqlx::query_as::<_, MintEvidenceRecord>(
        "SELECT id,collectible_mint_id,network,transaction_hash,contract_id,token_id,owner_account,ledger_sequence,event_index,successful,evidence_sha256,raw_event,processing_status,reconciliation_error,created_at FROM collectible_mint_evidence WHERE collectible_mint_id=$1 ORDER BY created_at DESC LIMIT 1",
    )
    .bind(mint.id)
    .fetch_optional(pool)
    .await
    .map_err(db_error)?;
    let ownership = sqlx::query_as::<_, OwnershipProjectionRecord>(
        "SELECT id,network,contract_id,token_id,owner_account,collectible_mint_id,source_transaction_hash,ledger_sequence,event_index,raw_event,created_at,updated_at FROM ownership_projections WHERE collectible_mint_id=$1",
    )
    .bind(mint.id)
    .fetch_optional(pool)
    .await
    .map_err(db_error)?;
    let order_status = sqlx::query_scalar::<_, String>("SELECT status FROM orders WHERE id=$1")
        .bind(job.order_id)
        .fetch_one(pool)
        .await
        .map_err(db_error)?;
    Ok(FulfillmentResponse {
        job,
        mint,
        latest_evidence,
        ownership,
        order_status,
    })
}

async fn load_job_for_update(
    tx: &mut Transaction<'_, Postgres>,
    job_id: Uuid,
) -> Result<FulfillmentJobRecord, ApiError> {
    sqlx::query_as::<_, FulfillmentJobRecord>(
        "SELECT id,organization_id,order_id,order_item_id,kind,status,idempotency_key,payload_sha256,payload,attempts,max_attempts,available_at,locked_at,locked_by,last_error,created_by_user_id,created_at,updated_at FROM fulfillment_jobs WHERE id=$1 FOR UPDATE",
    )
    .bind(job_id)
    .fetch_optional(&mut **tx)
    .await
    .map_err(db_error)?
    .ok_or(ApiError::NotFound)
}

async fn load_mint_for_update(
    tx: &mut Transaction<'_, Postgres>,
    job_id: Uuid,
) -> Result<CollectibleMintRecord, ApiError> {
    sqlx::query_as::<_, CollectibleMintRecord>(
        "SELECT id,fulfillment_job_id,order_item_id,collectible_edition_id,contract_id,recipient_account,metadata_sha256,mint_reference_sha256,token_id,transaction_hash,status,submission_response,failure_code,submitted_at,confirmed_at,created_at,updated_at FROM collectible_mints WHERE fulfillment_job_id=$1 FOR UPDATE",
    )
    .bind(job_id)
    .fetch_optional(&mut **tx)
    .await
    .map_err(db_error)?
    .ok_or(ApiError::NotFound)
}

fn stellar_account(value: String) -> Result<String, ApiError> {
    let value = value.trim().to_ascii_uppercase();
    validate_strkey(&value, ACCOUNT_VERSION, "invalid_stellar_account")?;
    Ok(value)
}

fn stellar_contract(value: String) -> Result<String, ApiError> {
    let value = value.trim().to_ascii_uppercase();
    validate_strkey(&value, CONTRACT_VERSION, "invalid_contract_id")?;
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

fn hex_string(value: String, length: usize, error: &'static str) -> Result<String, ApiError> {
    let value = value.trim().to_ascii_lowercase();
    validate_hex(&value, length, error)?;
    Ok(value)
}

fn validate_hex(value: &str, length: usize, error: &'static str) -> Result<(), ApiError> {
    if value.len() != length || !value.bytes().all(|byte| byte.is_ascii_hexdigit()) {
        Err(ApiError::InvalidRequest(error))
    } else {
        Ok(())
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
        .map_err(|_| ApiError::InvalidRequest("invalid_fulfillment_payload"))?;
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
    headers
        .get("x-crownfi-user-id")
        .and_then(|value| value.to_str().ok())
        .and_then(|value| Uuid::parse_str(value).ok())
        .ok_or(ApiError::Unauthorized)
}

async fn require_editor(
    pool: &PgPool,
    organization_id: Uuid,
    user_id: Uuid,
) -> Result<(), ApiError> {
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
                tracing::error!(%error, "collectible fulfillment database operation failed");
                ApiError::Database
            }
        };
    }
    tracing::error!(%error, "collectible fulfillment database operation failed");
    ApiError::Database
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validates_known_account() {
        assert!(validate_strkey(
            "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF",
            ACCOUNT_VERSION,
            "invalid"
        )
        .is_ok());
    }

    #[test]
    fn payload_hash_is_stable() {
        let value = serde_json::json!({"a": 1, "b": "c"});
        assert_eq!(hash_json(&value).unwrap(), hash_json(&value).unwrap());
    }
}
