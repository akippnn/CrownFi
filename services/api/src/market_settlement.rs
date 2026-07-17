use axum::{
    extract::{Path, State},
    http::{HeaderMap, StatusCode},
    routing::{get, post},
    Json, Router,
};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sqlx::{FromRow, PgPool, Postgres, Transaction};
use time::OffsetDateTime;
use uuid::Uuid;

use crate::{error::ApiError, state::AppState};

pub fn router() -> Router<AppState> {
    Router::new()
        .route(
            "/market-operations/settlement-items/:item_id/submission",
            post(record_submission),
        )
        .route(
            "/market-operations/settlement-items/:item_id/evidence",
            post(accept_settlement_evidence),
        )
        .route(
            "/markets/:market_id/settlement-status",
            get(get_settlement_status),
        )
}

#[derive(Debug, Deserialize)]
struct SubmissionRequest {
    transaction_hash: String,
}

#[derive(Debug, Deserialize)]
struct SettlementEvidenceRequest {
    transaction_hash: String,
    ledger_sequence: i64,
    operation_index: i32,
    event_reference: String,
    recipient_address: String,
    amount_minor: i64,
    #[serde(default)]
    evidence: Value,
}

#[derive(Debug, Clone, Serialize, FromRow)]
struct SettlementItemView {
    id: Uuid,
    settlement_run_id: Uuid,
    position_id: Uuid,
    recipient_stellar_account_id: Uuid,
    principal_minor: i64,
    payout_minor: i64,
    status: String,
    submitted_tx_hash: Option<String>,
    accepted_evidence_id: Option<Uuid>,
    confirmed_at: Option<OffsetDateTime>,
    created_at: OffsetDateTime,
    updated_at: OffsetDateTime,
}

#[derive(Debug, Clone, FromRow)]
struct SettlementItemContext {
    item_id: Uuid,
    settlement_run_id: Uuid,
    organization_id: Uuid,
    market_id: Uuid,
    run_kind: String,
    run_status: String,
    requested_by_user_id: Uuid,
    recipient_stellar_account_id: Uuid,
    recipient_address: String,
    payout_minor: i64,
    item_status: String,
    submitted_tx_hash: Option<String>,
    accepted_evidence_id: Option<Uuid>,
}

#[derive(Debug, Clone, Serialize, FromRow)]
struct SettlementEvidenceView {
    id: Uuid,
    settlement_run_id: Uuid,
    settlement_item_id: Uuid,
    recipient_stellar_account_id: Uuid,
    transaction_hash: String,
    ledger_sequence: i64,
    operation_index: i32,
    event_reference: String,
    amount_minor: i64,
    accepted_at: OffsetDateTime,
}

#[derive(Debug, Clone, Serialize, FromRow)]
struct SettlementStatusView {
    market_id: Uuid,
    run_id: Uuid,
    kind: String,
    run_status: String,
    total_stake_minor: i64,
    fee_minor: i64,
    distributable_minor: i64,
    total_planned_minor: i64,
    planned_items: i64,
    submitted_items: i64,
    confirmed_items: i64,
    failed_items: i64,
    created_at: OffsetDateTime,
    updated_at: OffsetDateTime,
}

async fn record_submission(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(item_id): Path<Uuid>,
    Json(body): Json<SubmissionRequest>,
) -> Result<Json<SettlementItemView>, ApiError> {
    require_settlement_worker(&state, &headers)?;
    let transaction_hash = validate_hash(
        body.transaction_hash,
        "invalid_market_settlement_transaction_hash",
    )?;
    let pool = database_pool(&state)?;
    let mut tx = pool.begin().await.map_err(map_database_error)?;
    let context = load_context_tx(&mut tx, item_id).await?;
    require_settlement_policy_tx(&mut tx, &context).await?;

    if context.accepted_evidence_id.is_some() || context.item_status == "confirmed" {
        return Err(ApiError::Conflict(
            "market_settlement_item_already_confirmed",
        ));
    }
    if context.item_status == "submitted" {
        if context.submitted_tx_hash.as_deref() != Some(transaction_hash.as_str()) {
            return Err(ApiError::Conflict("market_settlement_submission_conflict"));
        }
        tx.commit().await.map_err(map_database_error)?;
        return Ok(Json(load_item(pool, item_id).await?));
    }
    if context.item_status != "planned"
        || !matches!(
            context.run_status.as_str(),
            "planned" | "submitting" | "submitted"
        )
    {
        return Err(ApiError::Conflict("market_settlement_item_not_submittable"));
    }

    sqlx::query(
        "UPDATE prediction_market_settlement_items SET status = 'submitted', submitted_tx_hash = $2, updated_at = now() WHERE id = $1 AND status = 'planned'",
    )
    .bind(item_id)
    .bind(&transaction_hash)
    .execute(&mut *tx)
    .await
    .map_err(map_database_error)?;
    sqlx::query(
        "UPDATE prediction_market_settlement_runs SET status = 'submitting', updated_at = now() WHERE id = $1 AND status = 'planned'",
    )
    .bind(context.settlement_run_id)
    .execute(&mut *tx)
    .await
    .map_err(map_database_error)?;
    write_audit(
        &mut tx,
        context.organization_id,
        "prediction_market.settlement.submit",
        "prediction_market_settlement_item",
        item_id,
        json!({
            "market_id": context.market_id,
            "settlement_run_id": context.settlement_run_id,
            "transaction_hash": transaction_hash,
        }),
    )
    .await?;
    tx.commit().await.map_err(map_database_error)?;
    Ok(Json(load_item(pool, item_id).await?))
}

async fn accept_settlement_evidence(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(item_id): Path<Uuid>,
    Json(body): Json<SettlementEvidenceRequest>,
) -> Result<(StatusCode, Json<SettlementEvidenceView>), ApiError> {
    require_settlement_worker(&state, &headers)?;
    let transaction_hash = validate_hash(
        body.transaction_hash,
        "invalid_market_settlement_transaction_hash",
    )?;
    let event_reference = required_text(
        body.event_reference,
        240,
        "invalid_market_settlement_event_reference",
    )?;
    let recipient_address = validate_stellar_address(body.recipient_address)?;
    if body.ledger_sequence <= 0
        || body.operation_index < 0
        || body.amount_minor < 0
        || !body.evidence.is_object()
    {
        return Err(ApiError::InvalidRequest(
            "invalid_market_settlement_evidence",
        ));
    }

    let pool = database_pool(&state)?;
    let mut tx = pool.begin().await.map_err(map_database_error)?;
    let context = load_context_tx(&mut tx, item_id).await?;
    require_settlement_policy_tx(&mut tx, &context).await?;

    if let Some(existing) = load_evidence_tx(&mut tx, item_id).await? {
        if existing.transaction_hash != transaction_hash
            || existing.amount_minor != body.amount_minor
            || existing.event_reference != event_reference
        {
            return Err(ApiError::Conflict("market_settlement_evidence_conflict"));
        }
        tx.commit().await.map_err(map_database_error)?;
        return Ok((StatusCode::OK, Json(existing)));
    }
    if context.item_status != "submitted"
        || context.submitted_tx_hash.as_deref() != Some(transaction_hash.as_str())
    {
        return Err(ApiError::Conflict("market_settlement_item_not_submitted"));
    }
    if context.recipient_address != recipient_address || context.payout_minor != body.amount_minor {
        return Err(ApiError::Conflict("market_settlement_evidence_mismatch"));
    }

    let evidence_id = Uuid::new_v4();
    let accepted_at = OffsetDateTime::now_utc();
    sqlx::query(
        "INSERT INTO prediction_market_settlement_evidence (id, organization_id, settlement_run_id, settlement_item_id, recipient_stellar_account_id, transaction_hash, ledger_sequence, operation_index, event_reference, amount_minor, evidence_json, accepted_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)",
    )
    .bind(evidence_id)
    .bind(context.organization_id)
    .bind(context.settlement_run_id)
    .bind(item_id)
    .bind(context.recipient_stellar_account_id)
    .bind(&transaction_hash)
    .bind(body.ledger_sequence)
    .bind(body.operation_index)
    .bind(&event_reference)
    .bind(body.amount_minor)
    .bind(&body.evidence)
    .bind(accepted_at)
    .execute(&mut *tx)
    .await
    .map_err(map_database_error)?;
    sqlx::query(
        "UPDATE prediction_market_settlement_items SET status = 'confirmed', accepted_evidence_id = $2, confirmed_at = $3, updated_at = now() WHERE id = $1",
    )
    .bind(item_id)
    .bind(evidence_id)
    .bind(accepted_at)
    .execute(&mut *tx)
    .await
    .map_err(map_database_error)?;

    write_audit(
        &mut tx,
        context.organization_id,
        "prediction_market.settlement.confirm",
        "prediction_market_settlement_item",
        item_id,
        json!({
            "market_id": context.market_id,
            "settlement_run_id": context.settlement_run_id,
            "evidence_id": evidence_id,
            "transaction_hash": transaction_hash,
            "ledger_sequence": body.ledger_sequence,
            "operation_index": body.operation_index,
            "event_reference": event_reference,
        }),
    )
    .await?;
    finalize_if_complete(&mut tx, &context).await?;
    let evidence = load_evidence_tx(&mut tx, item_id)
        .await?
        .ok_or(ApiError::NotFound)?;
    tx.commit().await.map_err(map_database_error)?;
    Ok((StatusCode::CREATED, Json(evidence)))
}

async fn get_settlement_status(
    State(state): State<AppState>,
    Path(market_id): Path<Uuid>,
) -> Result<Json<SettlementStatusView>, ApiError> {
    let record = sqlx::query_as::<_, SettlementStatusView>(
        "SELECT sr.market_id, sr.id AS run_id, sr.kind, sr.status AS run_status, sr.total_stake_minor, sr.fee_minor, sr.distributable_minor, sr.total_planned_minor, COUNT(si.id)::BIGINT AS planned_items, COUNT(si.id) FILTER (WHERE si.status IN ('submitted','confirmed'))::BIGINT AS submitted_items, COUNT(si.id) FILTER (WHERE si.status = 'confirmed')::BIGINT AS confirmed_items, COUNT(si.id) FILTER (WHERE si.status = 'failed')::BIGINT AS failed_items, sr.created_at, sr.updated_at FROM prediction_market_settlement_runs sr JOIN prediction_market_settlement_items si ON si.settlement_run_id = sr.id WHERE sr.market_id = $1 GROUP BY sr.id ORDER BY sr.created_at DESC LIMIT 1",
    )
    .bind(market_id)
    .fetch_optional(database_pool(&state)?)
    .await
    .map_err(map_database_error)?
    .ok_or(ApiError::NotFound)?;
    Ok(Json(record))
}

async fn finalize_if_complete(
    tx: &mut Transaction<'_, Postgres>,
    context: &SettlementItemContext,
) -> Result<(), ApiError> {
    let remaining = sqlx::query_scalar::<_, i64>(
        "SELECT COUNT(*)::BIGINT FROM prediction_market_settlement_items WHERE settlement_run_id = $1 AND status <> 'confirmed'",
    )
    .bind(context.settlement_run_id)
    .fetch_one(&mut **tx)
    .await
    .map_err(map_database_error)?;
    if remaining != 0 {
        return Ok(());
    }

    sqlx::query(
        "UPDATE prediction_market_settlement_runs SET status = 'confirmed', updated_at = now() WHERE id = $1",
    )
    .bind(context.settlement_run_id)
    .execute(&mut **tx)
    .await
    .map_err(map_database_error)?;
    let position_status = if context.run_kind == "refund" {
        "refunded"
    } else {
        "settled"
    };
    sqlx::query(
        "UPDATE prediction_market_positions SET status = $2, settled_at = COALESCE(settled_at, now()), updated_at = now() WHERE market_id = $1 AND status = 'active'",
    )
    .bind(context.market_id)
    .bind(position_status)
    .execute(&mut **tx)
    .await
    .map_err(map_database_error)?;
    sqlx::query(
        "UPDATE prediction_markets SET status = 'settled', updated_at = now() WHERE id = $1 AND status = 'settling'",
    )
    .bind(context.market_id)
    .execute(&mut **tx)
    .await
    .map_err(map_database_error)?;
    sqlx::query(
        "INSERT INTO prediction_market_governance_events (id, organization_id, market_id, actor_user_id, action, previous_status, new_status, reason, evidence) VALUES ($1,$2,$3,$4,$5,'settling','settled',$6,$7)",
    )
    .bind(Uuid::new_v4())
    .bind(context.organization_id)
    .bind(context.market_id)
    .bind(context.requested_by_user_id)
    .bind(if context.run_kind == "refund" {
        "refund.confirmed"
    } else {
        "settlement.confirmed"
    })
    .bind(if context.run_kind == "refund" {
        "All cancellation refunds have accepted chain evidence."
    } else {
        "All resolution payouts have accepted chain evidence."
    })
    .bind(json!({"settlement_run_id": context.settlement_run_id}))
    .execute(&mut **tx)
    .await
    .map_err(map_database_error)?;
    write_audit(
        tx,
        context.organization_id,
        "prediction_market.settlement.complete",
        "prediction_market_settlement_run",
        context.settlement_run_id,
        json!({"market_id": context.market_id, "kind": context.run_kind}),
    )
    .await?;
    Ok(())
}

async fn load_context_tx(
    tx: &mut Transaction<'_, Postgres>,
    item_id: Uuid,
) -> Result<SettlementItemContext, ApiError> {
    sqlx::query_as::<_, SettlementItemContext>(
        "SELECT si.id AS item_id, si.settlement_run_id, sr.organization_id, sr.market_id, sr.kind AS run_kind, sr.status AS run_status, sr.requested_by_user_id, si.recipient_stellar_account_id, sa.address AS recipient_address, si.payout_minor, si.status AS item_status, si.submitted_tx_hash, si.accepted_evidence_id FROM prediction_market_settlement_items si JOIN prediction_market_settlement_runs sr ON sr.id = si.settlement_run_id JOIN stellar_accounts sa ON sa.id = si.recipient_stellar_account_id WHERE si.id = $1 FOR UPDATE OF si, sr",
    )
    .bind(item_id)
    .fetch_optional(&mut **tx)
    .await
    .map_err(map_database_error)?
    .ok_or(ApiError::NotFound)
}

async fn load_item(pool: &PgPool, item_id: Uuid) -> Result<SettlementItemView, ApiError> {
    sqlx::query_as::<_, SettlementItemView>(
        "SELECT id, settlement_run_id, position_id, recipient_stellar_account_id, principal_minor, payout_minor, status, submitted_tx_hash, accepted_evidence_id, confirmed_at, created_at, updated_at FROM prediction_market_settlement_items WHERE id = $1",
    )
    .bind(item_id)
    .fetch_optional(pool)
    .await
    .map_err(map_database_error)?
    .ok_or(ApiError::NotFound)
}

async fn load_evidence_tx(
    tx: &mut Transaction<'_, Postgres>,
    item_id: Uuid,
) -> Result<Option<SettlementEvidenceView>, ApiError> {
    sqlx::query_as::<_, SettlementEvidenceView>(
        "SELECT id, settlement_run_id, settlement_item_id, recipient_stellar_account_id, transaction_hash, ledger_sequence, operation_index, event_reference, amount_minor, accepted_at FROM prediction_market_settlement_evidence WHERE settlement_item_id = $1 FOR UPDATE",
    )
    .bind(item_id)
    .fetch_optional(&mut **tx)
    .await
    .map_err(map_database_error)
}

async fn require_settlement_policy_tx(
    tx: &mut Transaction<'_, Postgres>,
    context: &SettlementItemContext,
) -> Result<(), ApiError> {
    let action = if context.run_kind == "refund" {
        "refund"
    } else {
        "settle"
    };
    let allowed = sqlx::query_scalar::<_, bool>(
        "SELECT COALESCE((SELECT decision = 'allow' AND (expires_at IS NULL OR expires_at > now()) FROM prediction_market_policy_decisions WHERE market_id = $1 AND action = $2 AND subject_user_id IS NULL ORDER BY created_at DESC LIMIT 1), false)",
    )
    .bind(context.market_id)
    .bind(action)
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
    action: &str,
    entity_type: &str,
    entity_id: Uuid,
    metadata: Value,
) -> Result<(), ApiError> {
    sqlx::query(
        "INSERT INTO audit_logs (id, organization_id, actor_user_id, action, entity_type, entity_id, metadata) VALUES ($1,$2,NULL,$3,$4,$5,$6)",
    )
    .bind(Uuid::new_v4())
    .bind(organization_id)
    .bind(action)
    .bind(entity_type)
    .bind(entity_id)
    .bind(metadata)
    .execute(&mut **tx)
    .await
    .map_err(map_database_error)?;
    Ok(())
}

fn require_settlement_worker(state: &AppState, headers: &HeaderMap) -> Result<(), ApiError> {
    let provided = headers
        .get("x-crownfi-payout-worker-token")
        .and_then(|value| value.to_str().ok())
        .unwrap_or_default();
    match state.config.payout_worker_token.as_deref() {
        Some(expected) if !expected.is_empty() && provided == expected => Ok(()),
        _ => Err(ApiError::Unauthorized),
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
        Err(ApiError::InvalidRequest(
            "invalid_market_settlement_recipient",
        ))
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

fn map_database_error(error: sqlx::Error) -> ApiError {
    if let Some(database_error) = error.as_database_error() {
        let code = database_error.code().map(|code| code.into_owned());
        return match code.as_deref() {
            Some("23505") => ApiError::Conflict("market_settlement_operation_already_exists"),
            Some("23503") => ApiError::InvalidRequest("market_settlement_resource_missing"),
            Some("23514") | Some("22P02") => {
                ApiError::InvalidRequest("market_settlement_constraint_failed")
            }
            _ => {
                tracing::error!(error = %error, "prediction settlement database failure");
                ApiError::Database
            }
        };
    }
    tracing::error!(error = %error, "prediction settlement database failure");
    ApiError::Database
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn settlement_hashes_are_strict() {
        assert!(validate_hash("a".repeat(64), "bad").is_ok());
        assert!(validate_hash("z".repeat(64), "bad").is_err());
    }
}
