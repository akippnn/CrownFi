use axum::{
    extract::{Path, State},
    http::{HeaderMap, StatusCode},
    routing::{get, post},
    Json, Router,
};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use sqlx::{FromRow, PgPool, Postgres, Transaction};
use time::OffsetDateTime;
use uuid::Uuid;

use crate::{error::ApiError, state::AppState};

pub fn router() -> Router<AppState> {
    Router::new()
        .route(
            "/internal/voting/snapshots/:snapshot_id/anchor-intents",
            post(create_anchor_intent),
        )
        .route(
            "/internal/voting-anchor/intents/:intent_id/submission",
            post(record_anchor_submission),
        )
        .route(
            "/internal/voting-anchor/intents/:intent_id/evidence",
            post(accept_anchor_evidence),
        )
        .route("/voting/rounds/:round_id/anchor", get(get_round_anchor))
}

#[derive(Debug, Deserialize)]
struct CreateAnchorIntentRequest {
    idempotency_key: String,
}

#[derive(Debug, Deserialize)]
struct AnchorSubmissionRequest {
    transaction_hash: String,
}

#[derive(Debug, Deserialize)]
struct AnchorEvidenceRequest {
    transaction_hash: String,
    ledger_sequence: i64,
    event_reference: String,
    contract_id: String,
    contract_round_key: i64,
    merkle_root: String,
    tally_sha256: String,
    total_votes: i64,
    #[serde(default)]
    raw_event: Value,
}

#[derive(Debug, Clone, Serialize, FromRow)]
struct AnchorIntentRecord {
    id: Uuid,
    organization_id: Uuid,
    snapshot_id: Uuid,
    round_id: Uuid,
    contract_deployment_id: Uuid,
    contract_round_key: i64,
    network: String,
    contract_id: String,
    function_name: String,
    merkle_root: String,
    tally_sha256: String,
    total_votes: i64,
    operation_json: Value,
    request_sha256: String,
    idempotency_key: String,
    status: String,
    submitted_tx_hash: Option<String>,
    failure_code: Option<String>,
    created_by_user_id: Uuid,
    submitted_at: Option<OffsetDateTime>,
    confirmed_at: Option<OffsetDateTime>,
    created_at: OffsetDateTime,
    updated_at: OffsetDateTime,
}

#[derive(Debug, Clone, Serialize, FromRow)]
struct AnchorEvidenceRecord {
    id: Uuid,
    organization_id: Uuid,
    anchor_intent_id: Uuid,
    snapshot_id: Uuid,
    contract_deployment_id: Uuid,
    contract_round_key: i64,
    contract_id: String,
    transaction_hash: String,
    ledger_sequence: i64,
    event_reference: String,
    merkle_root: String,
    tally_sha256: String,
    total_votes: i64,
    raw_event: Value,
    accepted_at: OffsetDateTime,
    created_at: OffsetDateTime,
}

#[derive(Debug, Clone, Serialize)]
struct RoundAnchorResponse {
    intent: AnchorIntentRecord,
    evidence: Option<AnchorEvidenceRecord>,
}

#[derive(Debug, Clone, FromRow)]
struct SnapshotContext {
    organization_id: Uuid,
    pageant_id: Uuid,
    round_id: Uuid,
    snapshot_status: String,
    total_votes: i64,
    tally_sha256: String,
    merkle_root: String,
}

async fn create_anchor_intent(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(snapshot_id): Path<Uuid>,
    Json(body): Json<CreateAnchorIntentRequest>,
) -> Result<(StatusCode, Json<AnchorIntentRecord>), ApiError> {
    let actor_user_id = require_web_actor(&state, &headers)?;
    let idempotency_key = required_text(
        body.idempotency_key,
        200,
        "invalid_voting_anchor_idempotency_key",
    )?;
    let pool = database_pool(&state)?;
    let mut tx = pool.begin().await.map_err(map_database_error)?;

    let snapshot = sqlx::query_as::<_, SnapshotContext>(
        "SELECT organization_id, pageant_id, round_id, status AS snapshot_status, total_votes, tally_sha256, merkle_root FROM voting_snapshots WHERE id = $1 FOR UPDATE",
    )
    .bind(snapshot_id)
    .fetch_optional(&mut *tx)
    .await
    .map_err(map_database_error)?
    .ok_or(ApiError::NotFound)?;
    require_organization_editor_tx(&mut tx, snapshot.organization_id, actor_user_id).await?;
    if !matches!(
        snapshot.snapshot_status.as_str(),
        "created" | "anchor_pending"
    ) {
        return Err(ApiError::Conflict("voting_snapshot_not_anchorable"));
    }

    if let Some(existing) = sqlx::query_as::<_, AnchorIntentRecord>(
        "SELECT id, organization_id, snapshot_id, round_id, contract_deployment_id, contract_round_key, network, contract_id, function_name, merkle_root, tally_sha256, total_votes, operation_json, request_sha256, idempotency_key, status, submitted_tx_hash, failure_code, created_by_user_id, submitted_at, confirmed_at, created_at, updated_at FROM voting_anchor_intents WHERE snapshot_id = $1 FOR UPDATE",
    )
    .bind(snapshot_id)
    .fetch_optional(&mut *tx)
    .await
    .map_err(map_database_error)?
    {
        if existing.idempotency_key != idempotency_key {
            return Err(ApiError::Conflict("voting_snapshot_anchor_already_requested"));
        }
        tx.commit().await.map_err(map_database_error)?;
        return Ok((StatusCode::OK, Json(existing)));
    }

    let deployment = sqlx::query_as::<_, (Uuid, String)>(
        "SELECT id, contract_id FROM contract_deployments WHERE network = 'testnet' AND contract_kind = 'audit-anchor' AND status = 'verified' ORDER BY created_at DESC LIMIT 1 FOR SHARE",
    )
    .fetch_optional(&mut *tx)
    .await
    .map_err(map_database_error)?
    .ok_or(ApiError::Conflict("verified_audit_anchor_contract_missing"))?;

    let intent_id = Uuid::new_v4();
    let contract_round_key =
        sqlx::query_scalar::<_, i64>("SELECT nextval('voting_anchor_round_key_seq')::BIGINT")
            .fetch_one(&mut *tx)
            .await
            .map_err(map_database_error)?;
    let operation_json = json!({
        "network": "testnet",
        "contract_id": deployment.1,
        "function": "publish",
        "arguments": {
            "round_id_u32": contract_round_key,
            "merkle_root_bytes32_hex": snapshot.merkle_root,
            "tally_hash_bytes32_hex": snapshot.tally_sha256,
            "total_votes_u32": snapshot.total_votes,
        },
        "source": {
            "snapshot_id": snapshot_id,
            "round_id": snapshot.round_id,
            "pageant_id": snapshot.pageant_id,
        },
    });
    let operation_bytes = serde_json::to_vec(&operation_json)
        .map_err(|_| ApiError::InvalidRequest("voting_anchor_serialization_failed"))?;
    let request_sha256 = hash_bytes(&operation_bytes);

    sqlx::query(
        "INSERT INTO voting_anchor_intents (id, organization_id, snapshot_id, round_id, contract_deployment_id, contract_round_key, network, contract_id, function_name, merkle_root, tally_sha256, total_votes, operation_json, request_sha256, idempotency_key, status, created_by_user_id) VALUES ($1,$2,$3,$4,$5,$6,'testnet',$7,'publish',$8,$9,$10,$11,$12,$13,'created',$14)",
    )
    .bind(intent_id)
    .bind(snapshot.organization_id)
    .bind(snapshot_id)
    .bind(snapshot.round_id)
    .bind(deployment.0)
    .bind(contract_round_key)
    .bind(&deployment.1)
    .bind(&snapshot.merkle_root)
    .bind(&snapshot.tally_sha256)
    .bind(snapshot.total_votes)
    .bind(&operation_json)
    .bind(&request_sha256)
    .bind(&idempotency_key)
    .bind(actor_user_id)
    .execute(&mut *tx)
    .await
    .map_err(map_database_error)?;
    sqlx::query(
        "UPDATE voting_snapshots SET status = 'anchor_pending' WHERE id = $1 AND status = 'created'",
    )
    .bind(snapshot_id)
    .execute(&mut *tx)
    .await
    .map_err(map_database_error)?;
    write_audit(
        &mut tx,
        snapshot.organization_id,
        Some(actor_user_id),
        "voting_anchor.intent.create",
        "voting_anchor_intent",
        intent_id,
        json!({
            "snapshot_id": snapshot_id,
            "round_id": snapshot.round_id,
            "contract_deployment_id": deployment.0,
            "contract_round_key": contract_round_key,
            "request_sha256": request_sha256,
        }),
    )
    .await?;
    let record = load_intent_tx(&mut tx, intent_id).await?;
    tx.commit().await.map_err(map_database_error)?;
    Ok((StatusCode::CREATED, Json(record)))
}

async fn record_anchor_submission(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(intent_id): Path<Uuid>,
    Json(body): Json<AnchorSubmissionRequest>,
) -> Result<Json<AnchorIntentRecord>, ApiError> {
    require_anchor_worker(&state, &headers)?;
    let transaction_hash = validate_hash(
        body.transaction_hash,
        "invalid_voting_anchor_transaction_hash",
    )?;
    let pool = database_pool(&state)?;
    let mut tx = pool.begin().await.map_err(map_database_error)?;
    let intent = load_intent_tx(&mut tx, intent_id).await?;
    if intent.status == "confirmed" {
        return Err(ApiError::Conflict("voting_anchor_already_confirmed"));
    }
    if intent.status == "submitted" {
        if intent.submitted_tx_hash.as_deref() != Some(transaction_hash.as_str()) {
            return Err(ApiError::Conflict("voting_anchor_submission_conflict"));
        }
        tx.commit().await.map_err(map_database_error)?;
        return Ok(Json(intent));
    }
    if intent.status != "created" {
        return Err(ApiError::Conflict("voting_anchor_not_submittable"));
    }
    sqlx::query(
        "UPDATE voting_anchor_intents SET status = 'submitted', submitted_tx_hash = $2, submitted_at = now(), updated_at = now() WHERE id = $1 AND status = 'created'",
    )
    .bind(intent_id)
    .bind(&transaction_hash)
    .execute(&mut *tx)
    .await
    .map_err(map_database_error)?;
    write_audit(
        &mut tx,
        intent.organization_id,
        None,
        "voting_anchor.submit",
        "voting_anchor_intent",
        intent_id,
        json!({"transaction_hash": transaction_hash}),
    )
    .await?;
    let record = load_intent_tx(&mut tx, intent_id).await?;
    tx.commit().await.map_err(map_database_error)?;
    Ok(Json(record))
}

async fn accept_anchor_evidence(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(intent_id): Path<Uuid>,
    Json(body): Json<AnchorEvidenceRequest>,
) -> Result<(StatusCode, Json<AnchorEvidenceRecord>), ApiError> {
    require_anchor_worker(&state, &headers)?;
    let transaction_hash = validate_hash(
        body.transaction_hash,
        "invalid_voting_anchor_transaction_hash",
    )?;
    let event_reference = required_text(
        body.event_reference,
        240,
        "invalid_voting_anchor_event_reference",
    )?;
    let contract_id = validate_contract_id(body.contract_id)?;
    let merkle_root = validate_hash(body.merkle_root, "invalid_voting_merkle_root")?;
    let tally_sha256 = validate_hash(body.tally_sha256, "invalid_voting_tally_hash")?;
    if body.ledger_sequence <= 0
        || !(1..=4_294_967_295).contains(&body.contract_round_key)
        || !(0..=4_294_967_295).contains(&body.total_votes)
        || !body.raw_event.is_object()
    {
        return Err(ApiError::InvalidRequest("invalid_voting_anchor_evidence"));
    }

    let pool = database_pool(&state)?;
    let mut tx = pool.begin().await.map_err(map_database_error)?;
    let intent = load_intent_tx(&mut tx, intent_id).await?;
    if let Some(existing) = load_evidence_tx(&mut tx, intent_id).await? {
        if existing.transaction_hash != transaction_hash
            || existing.event_reference != event_reference
            || existing.merkle_root != merkle_root
            || existing.tally_sha256 != tally_sha256
        {
            return Err(ApiError::Conflict("voting_anchor_evidence_conflict"));
        }
        tx.commit().await.map_err(map_database_error)?;
        return Ok((StatusCode::OK, Json(existing)));
    }
    if intent.status != "submitted"
        || intent.submitted_tx_hash.as_deref() != Some(transaction_hash.as_str())
    {
        return Err(ApiError::Conflict("voting_anchor_not_submitted"));
    }
    if intent.contract_id != contract_id
        || intent.contract_round_key != body.contract_round_key
        || intent.merkle_root != merkle_root
        || intent.tally_sha256 != tally_sha256
        || intent.total_votes != body.total_votes
    {
        return Err(ApiError::Conflict("voting_anchor_evidence_mismatch"));
    }

    let evidence_id = Uuid::new_v4();
    let accepted_at = OffsetDateTime::now_utc();
    sqlx::query(
        "INSERT INTO voting_anchor_evidence (id, organization_id, anchor_intent_id, snapshot_id, contract_deployment_id, contract_round_key, contract_id, transaction_hash, ledger_sequence, event_reference, merkle_root, tally_sha256, total_votes, raw_event, accepted_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)",
    )
    .bind(evidence_id)
    .bind(intent.organization_id)
    .bind(intent_id)
    .bind(intent.snapshot_id)
    .bind(intent.contract_deployment_id)
    .bind(intent.contract_round_key)
    .bind(&intent.contract_id)
    .bind(&transaction_hash)
    .bind(body.ledger_sequence)
    .bind(&event_reference)
    .bind(&merkle_root)
    .bind(&tally_sha256)
    .bind(body.total_votes)
    .bind(&body.raw_event)
    .bind(accepted_at)
    .execute(&mut *tx)
    .await
    .map_err(map_database_error)?;
    sqlx::query(
        "UPDATE voting_anchor_intents SET status = 'confirmed', confirmed_at = $2, updated_at = now() WHERE id = $1",
    )
    .bind(intent_id)
    .bind(accepted_at)
    .execute(&mut *tx)
    .await
    .map_err(map_database_error)?;
    sqlx::query(
        "UPDATE voting_snapshots SET status = 'anchored', anchor_tx_hash = $2, anchor_contract_event_id = $3, accepted_evidence_id = $4, anchored_at = $5 WHERE id = $1 AND status = 'anchor_pending'",
    )
    .bind(intent.snapshot_id)
    .bind(&transaction_hash)
    .bind(&event_reference)
    .bind(evidence_id)
    .bind(accepted_at)
    .execute(&mut *tx)
    .await
    .map_err(map_database_error)?;
    sqlx::query(
        "UPDATE voting_rounds SET status = 'anchored', updated_at = now() WHERE id = $1 AND status = 'closed'",
    )
    .bind(intent.round_id)
    .execute(&mut *tx)
    .await
    .map_err(map_database_error)?;
    write_audit(
        &mut tx,
        intent.organization_id,
        None,
        "voting_anchor.confirm",
        "voting_anchor_evidence",
        evidence_id,
        json!({
            "intent_id": intent_id,
            "snapshot_id": intent.snapshot_id,
            "round_id": intent.round_id,
            "contract_round_key": intent.contract_round_key,
            "transaction_hash": transaction_hash,
            "ledger_sequence": body.ledger_sequence,
            "event_reference": event_reference,
        }),
    )
    .await?;
    let evidence = load_evidence_tx(&mut tx, intent_id)
        .await?
        .ok_or(ApiError::NotFound)?;
    tx.commit().await.map_err(map_database_error)?;
    Ok((StatusCode::CREATED, Json(evidence)))
}

async fn get_round_anchor(
    State(state): State<AppState>,
    Path(round_id): Path<Uuid>,
) -> Result<Json<RoundAnchorResponse>, ApiError> {
    let pool = database_pool(&state)?;
    let intent = sqlx::query_as::<_, AnchorIntentRecord>(
        "SELECT id, organization_id, snapshot_id, round_id, contract_deployment_id, contract_round_key, network, contract_id, function_name, merkle_root, tally_sha256, total_votes, operation_json, request_sha256, idempotency_key, status, submitted_tx_hash, failure_code, created_by_user_id, submitted_at, confirmed_at, created_at, updated_at FROM voting_anchor_intents WHERE round_id = $1",
    )
    .bind(round_id)
    .fetch_optional(pool)
    .await
    .map_err(map_database_error)?
    .ok_or(ApiError::NotFound)?;
    let evidence = sqlx::query_as::<_, AnchorEvidenceRecord>(
        "SELECT id, organization_id, anchor_intent_id, snapshot_id, contract_deployment_id, contract_round_key, contract_id, transaction_hash, ledger_sequence, event_reference, merkle_root, tally_sha256, total_votes, raw_event, accepted_at, created_at FROM voting_anchor_evidence WHERE anchor_intent_id = $1",
    )
    .bind(intent.id)
    .fetch_optional(pool)
    .await
    .map_err(map_database_error)?;
    Ok(Json(RoundAnchorResponse { intent, evidence }))
}

async fn load_intent_tx(
    tx: &mut Transaction<'_, Postgres>,
    intent_id: Uuid,
) -> Result<AnchorIntentRecord, ApiError> {
    sqlx::query_as::<_, AnchorIntentRecord>(
        "SELECT id, organization_id, snapshot_id, round_id, contract_deployment_id, contract_round_key, network, contract_id, function_name, merkle_root, tally_sha256, total_votes, operation_json, request_sha256, idempotency_key, status, submitted_tx_hash, failure_code, created_by_user_id, submitted_at, confirmed_at, created_at, updated_at FROM voting_anchor_intents WHERE id = $1 FOR UPDATE",
    )
    .bind(intent_id)
    .fetch_optional(&mut **tx)
    .await
    .map_err(map_database_error)?
    .ok_or(ApiError::NotFound)
}

async fn load_evidence_tx(
    tx: &mut Transaction<'_, Postgres>,
    intent_id: Uuid,
) -> Result<Option<AnchorEvidenceRecord>, ApiError> {
    sqlx::query_as::<_, AnchorEvidenceRecord>(
        "SELECT id, organization_id, anchor_intent_id, snapshot_id, contract_deployment_id, contract_round_key, contract_id, transaction_hash, ledger_sequence, event_reference, merkle_root, tally_sha256, total_votes, raw_event, accepted_at, created_at FROM voting_anchor_evidence WHERE anchor_intent_id = $1 FOR UPDATE",
    )
    .bind(intent_id)
    .fetch_optional(&mut **tx)
    .await
    .map_err(map_database_error)
}

async fn write_audit(
    tx: &mut Transaction<'_, Postgres>,
    organization_id: Uuid,
    actor_user_id: Option<Uuid>,
    action: &str,
    entity_type: &str,
    entity_id: Uuid,
    metadata: Value,
) -> Result<(), ApiError> {
    sqlx::query(
        "INSERT INTO audit_logs (id, organization_id, actor_user_id, action, entity_type, entity_id, metadata) VALUES ($1,$2,$3,$4,$5,$6,$7)",
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

fn require_anchor_worker(state: &AppState, headers: &HeaderMap) -> Result<(), ApiError> {
    let provided = headers
        .get("x-crownfi-payout-worker-token")
        .and_then(|value| value.to_str().ok())
        .unwrap_or_default();
    match state.config.payout_worker_token.as_deref() {
        Some(expected) if !expected.is_empty() && provided == expected => Ok(()),
        _ => Err(ApiError::Unauthorized),
    }
}

fn require_web_actor(state: &AppState, headers: &HeaderMap) -> Result<Uuid, ApiError> {
    let provided = headers
        .get("x-crownfi-web-token")
        .and_then(|value| value.to_str().ok())
        .unwrap_or_default();
    if state.config.web_internal_token.is_empty() || provided != state.config.web_internal_token {
        return Err(ApiError::Unauthorized);
    }
    headers
        .get("x-crownfi-user-id")
        .and_then(|value| value.to_str().ok())
        .and_then(|value| Uuid::parse_str(value).ok())
        .ok_or(ApiError::Unauthorized)
}

async fn require_organization_editor_tx(
    tx: &mut Transaction<'_, Postgres>,
    organization_id: Uuid,
    user_id: Uuid,
) -> Result<(), ApiError> {
    let allowed = sqlx::query_scalar::<_, bool>(
        "SELECT EXISTS (SELECT 1 FROM site_administrators WHERE user_id = $2 AND status = 'active' AND role IN ('owner','admin')) OR EXISTS (SELECT 1 FROM organization_members WHERE organization_id = $1 AND user_id = $2 AND status = 'active' AND role IN ('owner','admin','editor'))",
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

fn database_pool(state: &AppState) -> Result<&PgPool, ApiError> {
    state
        .database
        .as_ref()
        .ok_or(ApiError::ServiceUnavailable("database_not_configured"))
}

fn validate_hash(value: String, code: &'static str) -> Result<String, ApiError> {
    let value = value.trim().to_ascii_lowercase();
    if value.len() == 64 && value.chars().all(|character| character.is_ascii_hexdigit()) {
        Ok(value)
    } else {
        Err(ApiError::InvalidRequest(code))
    }
}

fn validate_contract_id(value: String) -> Result<String, ApiError> {
    let value = value.trim().to_ascii_uppercase();
    if value.len() == 56
        && value.starts_with('C')
        && value
            .chars()
            .skip(1)
            .all(|character| character.is_ascii_uppercase() || ('2'..='7').contains(&character))
    {
        Ok(value)
    } else {
        Err(ApiError::InvalidRequest("invalid_audit_anchor_contract_id"))
    }
}

fn required_text(value: String, max: usize, code: &'static str) -> Result<String, ApiError> {
    let value = value.trim().to_string();
    if value.is_empty() || value.len() > max {
        Err(ApiError::InvalidRequest(code))
    } else {
        Ok(value)
    }
}

fn hash_bytes(value: &[u8]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(value);
    hex::encode(hasher.finalize())
}

fn map_database_error(error: sqlx::Error) -> ApiError {
    if let Some(database_error) = error.as_database_error() {
        let code = database_error.code().map(|code| code.into_owned());
        return match code.as_deref() {
            Some("23505") => ApiError::Conflict("voting_anchor_resource_already_exists"),
            Some("23503") => ApiError::InvalidRequest("voting_anchor_resource_missing"),
            Some("23514") | Some("22P02") => {
                ApiError::InvalidRequest("voting_anchor_constraint_failed")
            }
            _ => {
                tracing::error!(error = %error, "voting anchor database operation failed");
                ApiError::Database
            }
        };
    }
    tracing::error!(error = %error, "voting anchor database operation failed");
    ApiError::Database
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn contract_id_validation_is_strict() {
        let valid = format!("C{}", "A".repeat(55));
        assert!(validate_contract_id(valid).is_ok());
        assert!(validate_contract_id("CINVALID".into()).is_err());
    }

    #[test]
    fn operation_hash_is_stable() {
        assert_eq!(hash_bytes(b"anchor"), hash_bytes(b"anchor"));
    }
}
