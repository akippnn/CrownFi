use axum::{
    extract::{Path, State},
    http::{HeaderMap, StatusCode},
    routing::post,
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
            "/internal/ticketing/issuances/:issuance_id/transfers",
            post(create_transfer),
        )
        .route(
            "/internal/ticketing/transfers/:transfer_id/review",
            post(review_transfer),
        )
        .route(
            "/internal/ticket-operations/transfers/:transfer_id/submission",
            post(record_transfer_submission),
        )
        .route(
            "/internal/ticket-operations/transfers/:transfer_id/evidence",
            post(accept_transfer_evidence),
        )
}

#[derive(Debug, Deserialize)]
struct CreateTransferRequest {
    to_address: String,
    idempotency_key: String,
    reason: String,
}

#[derive(Debug, Deserialize)]
struct ReviewTransferRequest {
    decision: String,
    reason: String,
}

#[derive(Debug, Deserialize)]
struct TransferSubmissionRequest {
    transaction_hash: String,
}

#[derive(Debug, Deserialize)]
struct TransferEvidenceRequest {
    transaction_hash: String,
    ledger_sequence: i64,
    event_reference: String,
    token_id: String,
    from_address: String,
    to_address: String,
    #[serde(default)]
    raw_event: Value,
}

#[derive(Debug, Clone, Serialize, FromRow)]
struct TransferRecord {
    id: Uuid,
    organization_id: Uuid,
    ticket_issuance_id: Uuid,
    token_id: String,
    from_user_id: Uuid,
    from_stellar_account_id: Uuid,
    to_user_id: Uuid,
    to_stellar_account_id: Uuid,
    policy: String,
    status: String,
    idempotency_key: String,
    request_sha256: String,
    reason: String,
    reviewed_by_user_id: Option<Uuid>,
    review_reason: Option<String>,
    submitted_tx_hash: Option<String>,
    accepted_evidence_id: Option<Uuid>,
    reviewed_at: Option<OffsetDateTime>,
    submitted_at: Option<OffsetDateTime>,
    confirmed_at: Option<OffsetDateTime>,
    created_at: OffsetDateTime,
    updated_at: OffsetDateTime,
}

#[derive(Debug, Clone, FromRow)]
struct TransferIssuanceContext {
    organization_id: Uuid,
    ticket_event_id: Uuid,
    ticket_product_id: Uuid,
    owner_user_id: Uuid,
    owner_stellar_account_id: Uuid,
    token_id: Option<String>,
    issuance_status: String,
    accepted_evidence_id: Option<Uuid>,
    transfer_policy: String,
    owner_address: String,
}

#[derive(Debug, Clone, FromRow)]
struct TransferContext {
    organization_id: Uuid,
    ticket_issuance_id: Uuid,
    token_id: String,
    from_user_id: Uuid,
    from_stellar_account_id: Uuid,
    from_address: String,
    to_user_id: Uuid,
    to_stellar_account_id: Uuid,
    to_address: String,
    policy: String,
    status: String,
    submitted_tx_hash: Option<String>,
    accepted_evidence_id: Option<Uuid>,
}

async fn create_transfer(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(issuance_id): Path<Uuid>,
    Json(body): Json<CreateTransferRequest>,
) -> Result<(StatusCode, Json<TransferRecord>), ApiError> {
    let actor_user_id = require_web_actor(&state, &headers)?;
    let to_address = validate_stellar_address(body.to_address)?;
    let idempotency_key = required_text(
        body.idempotency_key,
        200,
        "invalid_ticket_transfer_idempotency_key",
    )?;
    let reason = required_text(body.reason, 1000, "invalid_ticket_transfer_reason")?;
    let pool = database_pool(&state)?;
    let mut tx = pool.begin().await.map_err(map_database_error)?;

    let issuance = load_issuance_context_tx(&mut tx, issuance_id).await?;
    if issuance.owner_user_id != actor_user_id {
        return Err(ApiError::NotFound);
    }
    if issuance.issuance_status != "issued" || issuance.accepted_evidence_id.is_none() {
        return Err(ApiError::Conflict(
            "ticket_not_transferable_before_issuance",
        ));
    }
    if issuance.transfer_policy == "non_transferable" {
        return Err(ApiError::Conflict("ticket_transfer_not_allowed"));
    }
    let checked_in = sqlx::query_scalar::<_, bool>(
        "SELECT EXISTS (SELECT 1 FROM ticket_check_ins WHERE ticket_issuance_id = $1)",
    )
    .bind(issuance_id)
    .fetch_one(&mut *tx)
    .await
    .map_err(map_database_error)?;
    if checked_in {
        return Err(ApiError::Conflict("checked_in_ticket_not_transferable"));
    }
    if issuance.owner_address == to_address {
        return Err(ApiError::InvalidRequest("ticket_transfer_owner_unchanged"));
    }

    let destination = sqlx::query_as::<_, (Uuid, Uuid)>(
        "SELECT user_id, id FROM stellar_accounts WHERE network = 'testnet' AND address = $1 AND verified_at IS NOT NULL",
    )
    .bind(&to_address)
    .fetch_optional(&mut *tx)
    .await
    .map_err(map_database_error)?
    .ok_or(ApiError::InvalidRequest(
        "ticket_transfer_destination_not_verified",
    ))?;
    if destination.0 == actor_user_id {
        return Err(ApiError::InvalidRequest("ticket_transfer_owner_unchanged"));
    }

    let request_sha256 = hash_text(&format!(
        "ticket-transfer-v1|{issuance_id}|{actor_user_id}|{}|{to_address}|{idempotency_key}",
        issuance.owner_address
    ));
    if let Some(existing) = sqlx::query_as::<_, TransferRecord>(
        "SELECT id, organization_id, ticket_issuance_id, token_id, from_user_id, from_stellar_account_id, to_user_id, to_stellar_account_id, policy, status, idempotency_key, request_sha256, reason, reviewed_by_user_id, review_reason, submitted_tx_hash, accepted_evidence_id, reviewed_at, submitted_at, confirmed_at, created_at, updated_at FROM ticket_transfer_requests WHERE organization_id = $1 AND from_user_id = $2 AND idempotency_key = $3 FOR UPDATE",
    )
    .bind(issuance.organization_id)
    .bind(actor_user_id)
    .bind(&idempotency_key)
    .fetch_optional(&mut *tx)
    .await
    .map_err(map_database_error)?
    {
        if existing.request_sha256 != request_sha256 {
            return Err(ApiError::Conflict("ticket_transfer_idempotency_conflict"));
        }
        tx.commit().await.map_err(map_database_error)?;
        return Ok((StatusCode::OK, Json(existing)));
    }

    let transfer_id = Uuid::new_v4();
    let open_policy = issuance.transfer_policy == "open";
    let initial_status = if open_policy { "approved" } else { "requested" };
    let token_id = issuance
        .token_id
        .ok_or(ApiError::Conflict("ticket_token_missing"))?;
    sqlx::query(
        "INSERT INTO ticket_transfer_requests (id, organization_id, ticket_issuance_id, token_id, from_user_id, from_stellar_account_id, to_user_id, to_stellar_account_id, policy, status, idempotency_key, request_sha256, reason, reviewed_by_user_id, review_reason, reviewed_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)",
    )
    .bind(transfer_id)
    .bind(issuance.organization_id)
    .bind(issuance_id)
    .bind(&token_id)
    .bind(actor_user_id)
    .bind(issuance.owner_stellar_account_id)
    .bind(destination.0)
    .bind(destination.1)
    .bind(&issuance.transfer_policy)
    .bind(initial_status)
    .bind(&idempotency_key)
    .bind(&request_sha256)
    .bind(&reason)
    .bind(open_policy.then_some(actor_user_id))
    .bind(open_policy.then_some("Automatically approved by the configured open-transfer policy."))
    .bind(open_policy.then_some(OffsetDateTime::now_utc()))
    .execute(&mut *tx)
    .await
    .map_err(map_database_error)?;
    write_audit(
        &mut tx,
        issuance.organization_id,
        Some(actor_user_id),
        "ticket_transfer.create",
        transfer_id,
        json!({
            "ticket_issuance_id": issuance_id,
            "ticket_event_id": issuance.ticket_event_id,
            "ticket_product_id": issuance.ticket_product_id,
            "policy": issuance.transfer_policy,
            "status": initial_status,
            "from_address": issuance.owner_address,
            "to_address": to_address,
        }),
    )
    .await?;
    let record = load_transfer_tx(&mut tx, transfer_id).await?;
    tx.commit().await.map_err(map_database_error)?;
    Ok((StatusCode::CREATED, Json(record)))
}

async fn review_transfer(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(transfer_id): Path<Uuid>,
    Json(body): Json<ReviewTransferRequest>,
) -> Result<Json<TransferRecord>, ApiError> {
    let actor_user_id = require_web_actor(&state, &headers)?;
    let decision = body.decision.trim().to_ascii_lowercase();
    if !matches!(decision.as_str(), "approve" | "reject") {
        return Err(ApiError::InvalidRequest("invalid_ticket_transfer_decision"));
    }
    let reason = required_text(body.reason, 1000, "invalid_ticket_transfer_review_reason")?;
    let pool = database_pool(&state)?;
    let mut tx = pool.begin().await.map_err(map_database_error)?;
    let context = load_transfer_context_tx(&mut tx, transfer_id).await?;
    require_organization_editor_tx(&mut tx, context.organization_id, actor_user_id).await?;
    if context.status != "requested" || context.policy != "organizer_approved" {
        return Err(ApiError::Conflict("ticket_transfer_not_reviewable"));
    }
    let new_status = if decision == "approve" {
        "approved"
    } else {
        "rejected"
    };
    sqlx::query(
        "UPDATE ticket_transfer_requests SET status = $2, reviewed_by_user_id = $3, review_reason = $4, reviewed_at = now(), updated_at = now() WHERE id = $1 AND status = 'requested'",
    )
    .bind(transfer_id)
    .bind(new_status)
    .bind(actor_user_id)
    .bind(&reason)
    .execute(&mut *tx)
    .await
    .map_err(map_database_error)?;
    write_audit(
        &mut tx,
        context.organization_id,
        Some(actor_user_id),
        if decision == "approve" {
            "ticket_transfer.approve"
        } else {
            "ticket_transfer.reject"
        },
        transfer_id,
        json!({"reason": reason}),
    )
    .await?;
    let record = load_transfer_tx(&mut tx, transfer_id).await?;
    tx.commit().await.map_err(map_database_error)?;
    Ok(Json(record))
}

async fn record_transfer_submission(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(transfer_id): Path<Uuid>,
    Json(body): Json<TransferSubmissionRequest>,
) -> Result<Json<TransferRecord>, ApiError> {
    require_transfer_worker(&state, &headers)?;
    let transaction_hash = validate_hash(
        body.transaction_hash,
        "invalid_ticket_transfer_transaction_hash",
    )?;
    let pool = database_pool(&state)?;
    let mut tx = pool.begin().await.map_err(map_database_error)?;
    let context = load_transfer_context_tx(&mut tx, transfer_id).await?;
    if context.status == "submitted" {
        if context.submitted_tx_hash.as_deref() != Some(transaction_hash.as_str()) {
            return Err(ApiError::Conflict("ticket_transfer_submission_conflict"));
        }
        tx.commit().await.map_err(map_database_error)?;
        return Ok(Json(load_transfer(pool, transfer_id).await?));
    }
    if context.status != "approved" {
        return Err(ApiError::Conflict("ticket_transfer_not_approved"));
    }
    sqlx::query(
        "UPDATE ticket_transfer_requests SET status = 'submitted', submitted_tx_hash = $2, submitted_at = now(), updated_at = now() WHERE id = $1 AND status = 'approved'",
    )
    .bind(transfer_id)
    .bind(&transaction_hash)
    .execute(&mut *tx)
    .await
    .map_err(map_database_error)?;
    write_audit(
        &mut tx,
        context.organization_id,
        None,
        "ticket_transfer.submit",
        transfer_id,
        json!({"transaction_hash": transaction_hash}),
    )
    .await?;
    let record = load_transfer_tx(&mut tx, transfer_id).await?;
    tx.commit().await.map_err(map_database_error)?;
    Ok(Json(record))
}

async fn accept_transfer_evidence(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(transfer_id): Path<Uuid>,
    Json(body): Json<TransferEvidenceRequest>,
) -> Result<(StatusCode, Json<TransferRecord>), ApiError> {
    require_transfer_worker(&state, &headers)?;
    let transaction_hash = validate_hash(
        body.transaction_hash,
        "invalid_ticket_transfer_transaction_hash",
    )?;
    let event_reference = required_text(
        body.event_reference,
        240,
        "invalid_ticket_transfer_event_reference",
    )?;
    let token_id = required_text(body.token_id, 240, "invalid_ticket_token_id")?;
    let from_address = validate_stellar_address(body.from_address)?;
    let to_address = validate_stellar_address(body.to_address)?;
    if body.ledger_sequence <= 0 || !body.raw_event.is_object() {
        return Err(ApiError::InvalidRequest("invalid_ticket_transfer_evidence"));
    }

    let pool = database_pool(&state)?;
    let mut tx = pool.begin().await.map_err(map_database_error)?;
    let context = load_transfer_context_tx(&mut tx, transfer_id).await?;
    if context.status == "confirmed" {
        tx.commit().await.map_err(map_database_error)?;
        return Ok((
            StatusCode::OK,
            Json(load_transfer(pool, transfer_id).await?),
        ));
    }
    if context.status != "submitted"
        || context.submitted_tx_hash.as_deref() != Some(transaction_hash.as_str())
    {
        return Err(ApiError::Conflict("ticket_transfer_not_submitted"));
    }
    if context.token_id != token_id
        || context.from_address != from_address
        || context.to_address != to_address
    {
        return Err(ApiError::Conflict("ticket_transfer_evidence_mismatch"));
    }

    let issuance_current = load_issuance_context_tx(&mut tx, context.ticket_issuance_id).await?;
    if issuance_current.owner_stellar_account_id != context.from_stellar_account_id
        || issuance_current.owner_user_id != context.from_user_id
        || issuance_current.token_id.as_deref() != Some(token_id.as_str())
    {
        return Err(ApiError::Conflict("ticket_transfer_source_owner_drift"));
    }

    let evidence_id = Uuid::new_v4();
    let accepted_at = OffsetDateTime::now_utc();
    sqlx::query(
        "INSERT INTO ticket_ownership_evidence (id, organization_id, ticket_issuance_id, owner_stellar_account_id, token_id, transaction_hash, ledger_sequence, contract_event_id, evidence_json, accepted_at, event_kind) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'transfer')",
    )
    .bind(evidence_id)
    .bind(context.organization_id)
    .bind(context.ticket_issuance_id)
    .bind(context.to_stellar_account_id)
    .bind(&token_id)
    .bind(&transaction_hash)
    .bind(body.ledger_sequence)
    .bind(&event_reference)
    .bind(&body.raw_event)
    .bind(accepted_at)
    .execute(&mut *tx)
    .await
    .map_err(map_database_error)?;
    sqlx::query(
        "UPDATE ticket_issuances SET owner_user_id = $2, owner_stellar_account_id = $3, accepted_evidence_id = $4, status = 'issued', updated_at = now() WHERE id = $1",
    )
    .bind(context.ticket_issuance_id)
    .bind(context.to_user_id)
    .bind(context.to_stellar_account_id)
    .bind(evidence_id)
    .execute(&mut *tx)
    .await
    .map_err(map_database_error)?;
    sqlx::query(
        "UPDATE ticket_transfer_requests SET status = 'confirmed', accepted_evidence_id = $2, confirmed_at = $3, updated_at = now() WHERE id = $1",
    )
    .bind(transfer_id)
    .bind(evidence_id)
    .bind(accepted_at)
    .execute(&mut *tx)
    .await
    .map_err(map_database_error)?;
    write_audit(
        &mut tx,
        context.organization_id,
        None,
        "ticket_transfer.confirm",
        transfer_id,
        json!({
            "ticket_issuance_id": context.ticket_issuance_id,
            "evidence_id": evidence_id,
            "transaction_hash": transaction_hash,
            "ledger_sequence": body.ledger_sequence,
            "event_reference": event_reference,
            "from_address": from_address,
            "to_address": to_address,
        }),
    )
    .await?;
    let record = load_transfer_tx(&mut tx, transfer_id).await?;
    tx.commit().await.map_err(map_database_error)?;
    Ok((StatusCode::CREATED, Json(record)))
}

async fn load_issuance_context_tx(
    tx: &mut Transaction<'_, Postgres>,
    issuance_id: Uuid,
) -> Result<TransferIssuanceContext, ApiError> {
    sqlx::query_as::<_, TransferIssuanceContext>(
        "SELECT ti.organization_id, ti.ticket_event_id, ti.ticket_product_id, ti.owner_user_id, ti.owner_stellar_account_id, ti.token_id, ti.status AS issuance_status, ti.accepted_evidence_id, tp.transfer_policy, sa.address AS owner_address FROM ticket_issuances ti JOIN ticket_products tp ON tp.id = ti.ticket_product_id JOIN stellar_accounts sa ON sa.id = ti.owner_stellar_account_id WHERE ti.id = $1 FOR UPDATE OF ti",
    )
    .bind(issuance_id)
    .fetch_optional(&mut **tx)
    .await
    .map_err(map_database_error)?
    .ok_or(ApiError::NotFound)
}

async fn load_transfer_context_tx(
    tx: &mut Transaction<'_, Postgres>,
    transfer_id: Uuid,
) -> Result<TransferContext, ApiError> {
    sqlx::query_as::<_, TransferContext>(
        "SELECT tr.organization_id, tr.ticket_issuance_id, tr.token_id, tr.from_user_id, tr.from_stellar_account_id, from_sa.address AS from_address, tr.to_user_id, tr.to_stellar_account_id, to_sa.address AS to_address, tr.policy, tr.status, tr.submitted_tx_hash, tr.accepted_evidence_id FROM ticket_transfer_requests tr JOIN stellar_accounts from_sa ON from_sa.id = tr.from_stellar_account_id JOIN stellar_accounts to_sa ON to_sa.id = tr.to_stellar_account_id WHERE tr.id = $1 FOR UPDATE OF tr",
    )
    .bind(transfer_id)
    .fetch_optional(&mut **tx)
    .await
    .map_err(map_database_error)?
    .ok_or(ApiError::NotFound)
}

async fn load_transfer_tx(
    tx: &mut Transaction<'_, Postgres>,
    transfer_id: Uuid,
) -> Result<TransferRecord, ApiError> {
    sqlx::query_as::<_, TransferRecord>(
        "SELECT id, organization_id, ticket_issuance_id, token_id, from_user_id, from_stellar_account_id, to_user_id, to_stellar_account_id, policy, status, idempotency_key, request_sha256, reason, reviewed_by_user_id, review_reason, submitted_tx_hash, accepted_evidence_id, reviewed_at, submitted_at, confirmed_at, created_at, updated_at FROM ticket_transfer_requests WHERE id = $1 FOR UPDATE",
    )
    .bind(transfer_id)
    .fetch_optional(&mut **tx)
    .await
    .map_err(map_database_error)?
    .ok_or(ApiError::NotFound)
}

async fn load_transfer(pool: &PgPool, transfer_id: Uuid) -> Result<TransferRecord, ApiError> {
    sqlx::query_as::<_, TransferRecord>(
        "SELECT id, organization_id, ticket_issuance_id, token_id, from_user_id, from_stellar_account_id, to_user_id, to_stellar_account_id, policy, status, idempotency_key, request_sha256, reason, reviewed_by_user_id, review_reason, submitted_tx_hash, accepted_evidence_id, reviewed_at, submitted_at, confirmed_at, created_at, updated_at FROM ticket_transfer_requests WHERE id = $1",
    )
    .bind(transfer_id)
    .fetch_optional(pool)
    .await
    .map_err(map_database_error)?
    .ok_or(ApiError::NotFound)
}

async fn write_audit(
    tx: &mut Transaction<'_, Postgres>,
    organization_id: Uuid,
    actor_user_id: Option<Uuid>,
    action: &str,
    entity_id: Uuid,
    metadata: Value,
) -> Result<(), ApiError> {
    sqlx::query(
        "INSERT INTO audit_logs (id, organization_id, actor_user_id, action, entity_type, entity_id, metadata) VALUES ($1,$2,$3,$4,'ticket_transfer',$5,$6)",
    )
    .bind(Uuid::new_v4())
    .bind(organization_id)
    .bind(actor_user_id)
    .bind(action)
    .bind(entity_id)
    .bind(metadata)
    .execute(&mut **tx)
    .await
    .map_err(map_database_error)?;
    Ok(())
}

fn require_transfer_worker(state: &AppState, headers: &HeaderMap) -> Result<(), ApiError> {
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

fn validate_stellar_address(value: String) -> Result<String, ApiError> {
    let value = value.trim().to_ascii_uppercase();
    if value.len() == 56
        && value.starts_with('G')
        && value
            .chars()
            .skip(1)
            .all(|character| character.is_ascii_uppercase() || ('2'..='7').contains(&character))
    {
        Ok(value)
    } else {
        Err(ApiError::InvalidRequest("invalid_ticket_transfer_address"))
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

fn hash_text(value: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(value.as_bytes());
    hex::encode(hasher.finalize())
}

fn map_database_error(error: sqlx::Error) -> ApiError {
    if let Some(database_error) = error.as_database_error() {
        let code = database_error.code().map(|code| code.into_owned());
        return match code.as_deref() {
            Some("23505") => ApiError::Conflict("ticket_transfer_already_exists"),
            Some("23503") => ApiError::InvalidRequest("ticket_transfer_resource_missing"),
            Some("23514") | Some("22P02") => {
                ApiError::InvalidRequest("ticket_transfer_constraint_failed")
            }
            _ => {
                tracing::error!(error = %error, "ticket transfer database operation failed");
                ApiError::Database
            }
        };
    }
    tracing::error!(error = %error, "ticket transfer database operation failed");
    ApiError::Database
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn transfer_request_hash_is_stable() {
        assert_eq!(hash_text("transfer"), hash_text("transfer"));
    }

    #[test]
    fn destination_address_is_strict() {
        let valid = format!("G{}", "A".repeat(55));
        assert!(validate_stellar_address(valid).is_ok());
        assert!(validate_stellar_address("GINVALID".into()).is_err());
    }
}
