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
            "/market-operations/markets/:market_id/position-evidence",
            post(accept_position_evidence),
        )
        .route(
            "/market-operations/markets/:market_id/settlement-plan",
            post(create_settlement_plan),
        )
        .route(
            "/markets/:market_id/positions-summary",
            get(get_positions_summary),
        )
        .route(
            "/markets/:market_id/settlement-plan",
            get(get_settlement_plan),
        )
}

#[derive(Debug, Deserialize)]
struct AcceptPositionEvidenceRequest {
    stake_intent_id: Uuid,
    tx_hash: String,
    ledger_sequence: i64,
    contract_event_id: String,
    source_address: String,
    amount_minor: i64,
    #[serde(default)]
    evidence: Value,
}

#[derive(Debug, Clone, Serialize, FromRow)]
struct PositionEvidenceRecord {
    id: Uuid,
    organization_id: Uuid,
    market_id: Uuid,
    stake_intent_id: Uuid,
    outcome_id: Uuid,
    source_stellar_account_id: Uuid,
    tx_hash: String,
    ledger_sequence: i64,
    contract_event_id: String,
    amount_minor: i64,
    evidence_json: Value,
    accepted_at: OffsetDateTime,
    created_at: OffsetDateTime,
}

#[derive(Debug, Clone, FromRow)]
struct StakeIntentContext {
    organization_id: Uuid,
    market_id: Uuid,
    outcome_id: Uuid,
    user_id: Uuid,
    stellar_account_id: Uuid,
    expected_amount_minor: i64,
    intent_status: String,
    source_address: String,
    max_market_exposure_minor: i64,
}

#[derive(Debug, Clone, Serialize, FromRow)]
struct PositionSummaryEntry {
    outcome_id: Uuid,
    code: String,
    label: String,
    active_positions: i64,
    total_active_minor: i64,
}

#[derive(Debug, Clone, Serialize)]
struct PositionsSummaryResponse {
    market_id: Uuid,
    total_positions: i64,
    total_active_minor: i64,
    outcomes: Vec<PositionSummaryEntry>,
}

#[derive(Debug, Deserialize)]
struct CreateSettlementPlanRequest {
    idempotency_key: String,
    reason: String,
}

#[derive(Debug, Clone, FromRow)]
struct SettlementContext {
    organization_id: Uuid,
    status: String,
    fee_bps: i32,
    winning_outcome_id: Option<Uuid>,
}

#[derive(Debug, Clone, FromRow)]
struct ActivePosition {
    position_id: Uuid,
    outcome_id: Uuid,
    amount_minor: i64,
    stellar_account_id: Uuid,
}

#[derive(Debug, Clone, Serialize, FromRow)]
struct SettlementRunRecord {
    id: Uuid,
    organization_id: Uuid,
    market_id: Uuid,
    kind: String,
    status: String,
    winning_outcome_id: Option<Uuid>,
    idempotency_key: String,
    total_stake_minor: i64,
    fee_minor: i64,
    distributable_minor: i64,
    total_planned_minor: i64,
    requested_by_user_id: Uuid,
    failure_code: Option<String>,
    created_at: OffsetDateTime,
    updated_at: OffsetDateTime,
}

#[derive(Debug, Clone, Serialize, FromRow)]
struct SettlementItemRecord {
    id: Uuid,
    position_id: Uuid,
    recipient_stellar_account_id: Uuid,
    principal_minor: i64,
    payout_minor: i64,
    status: String,
    submitted_tx_hash: Option<String>,
    confirmed_at: Option<OffsetDateTime>,
}

#[derive(Debug, Clone, Serialize)]
struct SettlementPlanResponse {
    run: SettlementRunRecord,
    items: Vec<SettlementItemRecord>,
}

async fn accept_position_evidence(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(market_id): Path<Uuid>,
    Json(body): Json<AcceptPositionEvidenceRequest>,
) -> Result<(StatusCode, Json<PositionEvidenceRecord>), ApiError> {
    require_chain_worker(&state, &headers)?;
    let pool = database_pool(&state)?;
    let tx_hash = validate_tx_hash(body.tx_hash)?;
    let contract_event_id = required_text(body.contract_event_id, 240, "invalid_market_event_id")?;
    let source_address = validate_stellar_address(body.source_address)?;
    if body.ledger_sequence <= 0 || body.amount_minor <= 0 || !body.evidence.is_object() {
        return Err(ApiError::InvalidRequest("invalid_market_position_evidence"));
    }

    let mut tx = pool.begin().await.map_err(map_database_error)?;
    let intent = sqlx::query_as::<_, StakeIntentContext>(
        "SELECT psi.organization_id, psi.market_id, psi.outcome_id, psi.user_id, psi.stellar_account_id, psi.amount_minor AS expected_amount_minor, psi.status AS intent_status, sa.address AS source_address, pm.max_market_exposure_minor FROM prediction_market_stake_intents psi JOIN stellar_accounts sa ON sa.id = psi.stellar_account_id JOIN prediction_markets pm ON pm.id = psi.market_id WHERE psi.id = $1 FOR UPDATE OF psi, pm",
    )
    .bind(body.stake_intent_id)
    .fetch_optional(&mut *tx)
    .await
    .map_err(map_database_error)?
    .ok_or(ApiError::NotFound)?;
    if intent.market_id != market_id {
        return Err(ApiError::NotFound);
    }

    if let Some(existing) = load_evidence_tx(&mut tx, body.stake_intent_id).await? {
        if existing.tx_hash != tx_hash
            || existing.amount_minor != body.amount_minor
            || existing.contract_event_id != contract_event_id
        {
            return Err(ApiError::Conflict(
                "market_evidence_conflicts_with_accepted_record",
            ));
        }
        tx.commit().await.map_err(map_database_error)?;
        return Ok((StatusCode::OK, Json(existing)));
    }

    if intent.intent_status != "submitted" {
        return Err(ApiError::Conflict("market_intent_not_submitted"));
    }
    if intent.expected_amount_minor != body.amount_minor || intent.source_address != source_address
    {
        return Err(ApiError::Conflict("market_position_evidence_mismatch"));
    }

    let current_exposure = sqlx::query_scalar::<_, i64>(
        "SELECT COALESCE(SUM(amount_minor),0)::BIGINT FROM prediction_market_positions WHERE market_id = $1 AND status = 'active'",
    )
    .bind(market_id)
    .fetch_one(&mut *tx)
    .await
    .map_err(map_database_error)?;
    if current_exposure
        .checked_add(body.amount_minor)
        .is_none_or(|total| total > intent.max_market_exposure_minor)
    {
        return Err(ApiError::Conflict("market_exposure_limit_exceeded"));
    }

    let evidence_id = Uuid::new_v4();
    let accepted_at = OffsetDateTime::now_utc();
    sqlx::query(
        "INSERT INTO prediction_market_position_evidence (id, organization_id, market_id, stake_intent_id, outcome_id, source_stellar_account_id, tx_hash, ledger_sequence, contract_event_id, amount_minor, evidence_json, accepted_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)",
    )
    .bind(evidence_id)
    .bind(intent.organization_id)
    .bind(market_id)
    .bind(body.stake_intent_id)
    .bind(intent.outcome_id)
    .bind(intent.stellar_account_id)
    .bind(&tx_hash)
    .bind(body.ledger_sequence)
    .bind(&contract_event_id)
    .bind(body.amount_minor)
    .bind(&body.evidence)
    .bind(accepted_at)
    .execute(&mut *tx)
    .await
    .map_err(map_database_error)?;

    sqlx::query(
        "INSERT INTO prediction_market_positions (id, organization_id, market_id, outcome_id, user_id, stellar_account_id, stake_intent_id, amount_minor, status, accepted_evidence_id, activated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'active',$9,$10) ON CONFLICT (stake_intent_id) DO UPDATE SET status = 'active', accepted_evidence_id = EXCLUDED.accepted_evidence_id, activated_at = EXCLUDED.activated_at, updated_at = now()",
    )
    .bind(Uuid::new_v4())
    .bind(intent.organization_id)
    .bind(market_id)
    .bind(intent.outcome_id)
    .bind(intent.user_id)
    .bind(intent.stellar_account_id)
    .bind(body.stake_intent_id)
    .bind(body.amount_minor)
    .bind(evidence_id)
    .bind(accepted_at)
    .execute(&mut *tx)
    .await
    .map_err(map_database_error)?;
    sqlx::query(
        "UPDATE prediction_market_outcomes SET total_active_minor = total_active_minor + $2 WHERE id = $1",
    )
    .bind(intent.outcome_id)
    .bind(body.amount_minor)
    .execute(&mut *tx)
    .await
    .map_err(map_database_error)?;
    sqlx::query(
        "UPDATE prediction_market_stake_intents SET status = 'confirmed', confirmed_at = $2, updated_at = now() WHERE id = $1",
    )
    .bind(body.stake_intent_id)
    .bind(accepted_at)
    .execute(&mut *tx)
    .await
    .map_err(map_database_error)?;
    write_audit(
        &mut tx,
        intent.organization_id,
        None,
        "prediction_market.position.accept",
        "prediction_market_position_evidence",
        evidence_id,
        json!({
            "market_id": market_id,
            "stake_intent_id": body.stake_intent_id,
            "tx_hash": tx_hash,
            "ledger_sequence": body.ledger_sequence,
            "contract_event_id": contract_event_id,
        }),
    )
    .await?;
    tx.commit().await.map_err(map_database_error)?;

    Ok((
        StatusCode::CREATED,
        Json(load_evidence(pool, evidence_id).await?),
    ))
}

async fn get_positions_summary(
    State(state): State<AppState>,
    Path(market_id): Path<Uuid>,
) -> Result<Json<PositionsSummaryResponse>, ApiError> {
    let pool = database_pool(&state)?;
    let exists = sqlx::query_scalar::<_, bool>(
        "SELECT EXISTS (SELECT 1 FROM prediction_markets WHERE id = $1 AND status <> 'draft')",
    )
    .bind(market_id)
    .fetch_one(pool)
    .await
    .map_err(map_database_error)?;
    if !exists {
        return Err(ApiError::NotFound);
    }
    let outcomes = sqlx::query_as::<_, PositionSummaryEntry>(
        "SELECT o.id AS outcome_id, o.code, o.label, COUNT(p.id)::BIGINT AS active_positions, COALESCE(SUM(p.amount_minor),0)::BIGINT AS total_active_minor FROM prediction_market_outcomes o LEFT JOIN prediction_market_positions p ON p.outcome_id = o.id AND p.status = 'active' WHERE o.market_id = $1 GROUP BY o.id, o.code, o.label, o.sort_order ORDER BY o.sort_order",
    )
    .bind(market_id)
    .fetch_all(pool)
    .await
    .map_err(map_database_error)?;
    let total_positions = outcomes.iter().map(|entry| entry.active_positions).sum();
    let total_active_minor = outcomes.iter().map(|entry| entry.total_active_minor).sum();
    Ok(Json(PositionsSummaryResponse {
        market_id,
        total_positions,
        total_active_minor,
        outcomes,
    }))
}

async fn create_settlement_plan(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(market_id): Path<Uuid>,
    Json(body): Json<CreateSettlementPlanRequest>,
) -> Result<(StatusCode, Json<SettlementPlanResponse>), ApiError> {
    let actor_user_id = require_web_actor(&state, &headers)?;
    let idempotency_key = required_text(
        body.idempotency_key,
        200,
        "invalid_market_settlement_idempotency_key",
    )?;
    let reason = required_text(body.reason, 1000, "invalid_market_settlement_reason")?;
    let pool = database_pool(&state)?;
    let mut tx = pool.begin().await.map_err(map_database_error)?;
    let market = sqlx::query_as::<_, SettlementContext>(
        "SELECT organization_id, status, fee_bps, winning_outcome_id FROM prediction_markets WHERE id = $1 FOR UPDATE",
    )
    .bind(market_id)
    .fetch_optional(&mut *tx)
    .await
    .map_err(map_database_error)?
    .ok_or(ApiError::NotFound)?;
    require_organization_manager_tx(&mut tx, market.organization_id, actor_user_id).await?;

    let kind = match market.status.as_str() {
        "resolved" => "payout",
        "cancelled" => "refund",
        "settling" | "settled" => {
            if let Some(existing_id) = sqlx::query_scalar::<_, Uuid>(
                "SELECT id FROM prediction_market_settlement_runs WHERE market_id = $1 AND idempotency_key = $2 ORDER BY created_at DESC LIMIT 1",
            )
            .bind(market_id)
            .bind(&idempotency_key)
            .fetch_optional(&mut *tx)
            .await
            .map_err(map_database_error)?
            {
                tx.commit().await.map_err(map_database_error)?;
                return Ok((StatusCode::OK, Json(load_settlement(pool, existing_id).await?)));
            }
            return Err(ApiError::Conflict("market_settlement_already_started"));
        }
        _ => return Err(ApiError::Conflict("market_not_resolved_or_cancelled")),
    };

    if let Some(existing_id) = sqlx::query_scalar::<_, Uuid>(
        "SELECT id FROM prediction_market_settlement_runs WHERE market_id = $1 AND kind = $2 AND idempotency_key = $3 FOR UPDATE",
    )
    .bind(market_id)
    .bind(kind)
    .bind(&idempotency_key)
    .fetch_optional(&mut *tx)
    .await
    .map_err(map_database_error)?
    {
        tx.commit().await.map_err(map_database_error)?;
        return Ok((StatusCode::OK, Json(load_settlement(pool, existing_id).await?)));
    }

    let positions = sqlx::query_as::<_, ActivePosition>(
        "SELECT id AS position_id, outcome_id, amount_minor, stellar_account_id FROM prediction_market_positions WHERE market_id = $1 AND status = 'active' ORDER BY created_at, id FOR UPDATE",
    )
    .bind(market_id)
    .fetch_all(&mut *tx)
    .await
    .map_err(map_database_error)?;
    if positions.is_empty() {
        return Err(ApiError::Conflict("market_has_no_active_positions"));
    }
    let total_stake_minor = positions.iter().try_fold(0_i64, |total, position| {
        total
            .checked_add(position.amount_minor)
            .ok_or(ApiError::InvalidRequest(
                "market_settlement_amount_overflow",
            ))
    })?;

    let winning_outcome_id = if kind == "payout" {
        Some(
            market
                .winning_outcome_id
                .ok_or(ApiError::Conflict("market_winning_outcome_missing"))?,
        )
    } else {
        None
    };
    let fee_minor = if kind == "payout" {
        i64::try_from((i128::from(total_stake_minor) * i128::from(market.fee_bps)) / 10_000_i128)
            .map_err(|_| ApiError::InvalidRequest("market_settlement_amount_overflow"))?
    } else {
        0
    };
    let distributable_minor =
        total_stake_minor
            .checked_sub(fee_minor)
            .ok_or(ApiError::InvalidRequest(
                "market_settlement_amount_overflow",
            ))?;

    let mut planned: Vec<(ActivePosition, i64)> = if let Some(winner) = winning_outcome_id {
        let winners = positions
            .iter()
            .filter(|position| position.outcome_id == winner)
            .cloned()
            .collect::<Vec<_>>();
        if winners.is_empty() {
            return Err(ApiError::Conflict("market_has_no_winning_positions"));
        }
        let winning_stake = winners.iter().try_fold(0_i64, |total, position| {
            total
                .checked_add(position.amount_minor)
                .ok_or(ApiError::InvalidRequest(
                    "market_settlement_amount_overflow",
                ))
        })?;
        let mut rows = Vec::with_capacity(winners.len());
        let mut allocated = 0_i64;
        for position in winners {
            let payout = i64::try_from(
                (i128::from(position.amount_minor) * i128::from(distributable_minor))
                    / i128::from(winning_stake),
            )
            .map_err(|_| ApiError::InvalidRequest("market_settlement_amount_overflow"))?;
            allocated = allocated
                .checked_add(payout)
                .ok_or(ApiError::InvalidRequest(
                    "market_settlement_amount_overflow",
                ))?;
            rows.push((position, payout));
        }
        let mut remainder = distributable_minor - allocated;
        let mut index = 0_usize;
        while remainder > 0 {
            rows[index].1 += 1;
            remainder -= 1;
            index = (index + 1) % rows.len();
        }
        rows
    } else {
        positions
            .into_iter()
            .map(|position| {
                let payout = position.amount_minor;
                (position, payout)
            })
            .collect()
    };
    planned.sort_by_key(|(position, _)| position.position_id);
    let total_planned_minor = planned.iter().try_fold(0_i64, |total, (_, payout)| {
        total.checked_add(*payout).ok_or(ApiError::InvalidRequest(
            "market_settlement_amount_overflow",
        ))
    })?;
    if total_planned_minor != distributable_minor {
        return Err(ApiError::Conflict("market_settlement_conservation_failed"));
    }

    let run_id = Uuid::new_v4();
    sqlx::query(
        "INSERT INTO prediction_market_settlement_runs (id, organization_id, market_id, kind, status, winning_outcome_id, idempotency_key, total_stake_minor, fee_minor, distributable_minor, total_planned_minor, requested_by_user_id) VALUES ($1,$2,$3,$4,'planned',$5,$6,$7,$8,$9,$10,$11)",
    )
    .bind(run_id)
    .bind(market.organization_id)
    .bind(market_id)
    .bind(kind)
    .bind(winning_outcome_id)
    .bind(&idempotency_key)
    .bind(total_stake_minor)
    .bind(fee_minor)
    .bind(distributable_minor)
    .bind(total_planned_minor)
    .bind(actor_user_id)
    .execute(&mut *tx)
    .await
    .map_err(map_database_error)?;
    for (position, payout_minor) in &planned {
        sqlx::query(
            "INSERT INTO prediction_market_settlement_items (id, settlement_run_id, position_id, recipient_stellar_account_id, principal_minor, payout_minor, status) VALUES ($1,$2,$3,$4,$5,$6,'planned')",
        )
        .bind(Uuid::new_v4())
        .bind(run_id)
        .bind(position.position_id)
        .bind(position.stellar_account_id)
        .bind(position.amount_minor)
        .bind(payout_minor)
        .execute(&mut *tx)
        .await
        .map_err(map_database_error)?;
    }
    sqlx::query(
        "UPDATE prediction_markets SET status = 'settling', updated_at = now() WHERE id = $1",
    )
    .bind(market_id)
    .execute(&mut *tx)
    .await
    .map_err(map_database_error)?;
    sqlx::query(
        "INSERT INTO prediction_market_governance_events (id, organization_id, market_id, actor_user_id, action, previous_status, new_status, reason, evidence) VALUES ($1,$2,$3,$4,'settlement.plan',$5,'settling',$6,$7)",
    )
    .bind(Uuid::new_v4())
    .bind(market.organization_id)
    .bind(market_id)
    .bind(actor_user_id)
    .bind(&market.status)
    .bind(&reason)
    .bind(json!({"settlement_run_id": run_id, "kind": kind, "item_count": planned.len(), "total_stake_minor": total_stake_minor, "fee_minor": fee_minor, "distributable_minor": distributable_minor}))
    .execute(&mut *tx)
    .await
    .map_err(map_database_error)?;
    write_audit(
        &mut tx,
        market.organization_id,
        Some(actor_user_id),
        "prediction_market.settlement.plan",
        "prediction_market_settlement_run",
        run_id,
        json!({"market_id": market_id, "kind": kind, "item_count": planned.len()}),
    )
    .await?;
    tx.commit().await.map_err(map_database_error)?;

    Ok((
        StatusCode::CREATED,
        Json(load_settlement(pool, run_id).await?),
    ))
}

async fn get_settlement_plan(
    State(state): State<AppState>,
    Path(market_id): Path<Uuid>,
) -> Result<Json<SettlementPlanResponse>, ApiError> {
    let pool = database_pool(&state)?;
    let run_id = sqlx::query_scalar::<_, Uuid>(
        "SELECT id FROM prediction_market_settlement_runs WHERE market_id = $1 ORDER BY created_at DESC LIMIT 1",
    )
    .bind(market_id)
    .fetch_optional(pool)
    .await
    .map_err(map_database_error)?
    .ok_or(ApiError::NotFound)?;
    Ok(Json(load_settlement(pool, run_id).await?))
}

async fn load_evidence(
    pool: &PgPool,
    evidence_id: Uuid,
) -> Result<PositionEvidenceRecord, ApiError> {
    sqlx::query_as::<_, PositionEvidenceRecord>(
        "SELECT id, organization_id, market_id, stake_intent_id, outcome_id, source_stellar_account_id, tx_hash, ledger_sequence, contract_event_id, amount_minor, evidence_json, accepted_at, created_at FROM prediction_market_position_evidence WHERE id = $1",
    )
    .bind(evidence_id)
    .fetch_optional(pool)
    .await
    .map_err(map_database_error)?
    .ok_or(ApiError::NotFound)
}

async fn load_evidence_tx(
    tx: &mut Transaction<'_, Postgres>,
    stake_intent_id: Uuid,
) -> Result<Option<PositionEvidenceRecord>, ApiError> {
    sqlx::query_as::<_, PositionEvidenceRecord>(
        "SELECT id, organization_id, market_id, stake_intent_id, outcome_id, source_stellar_account_id, tx_hash, ledger_sequence, contract_event_id, amount_minor, evidence_json, accepted_at, created_at FROM prediction_market_position_evidence WHERE stake_intent_id = $1 FOR UPDATE",
    )
    .bind(stake_intent_id)
    .fetch_optional(&mut **tx)
    .await
    .map_err(map_database_error)
}

async fn load_settlement(pool: &PgPool, run_id: Uuid) -> Result<SettlementPlanResponse, ApiError> {
    let run = sqlx::query_as::<_, SettlementRunRecord>(
        "SELECT id, organization_id, market_id, kind, status, winning_outcome_id, idempotency_key, total_stake_minor, fee_minor, distributable_minor, total_planned_minor, requested_by_user_id, failure_code, created_at, updated_at FROM prediction_market_settlement_runs WHERE id = $1",
    )
    .bind(run_id)
    .fetch_optional(pool)
    .await
    .map_err(map_database_error)?
    .ok_or(ApiError::NotFound)?;
    let items = sqlx::query_as::<_, SettlementItemRecord>(
        "SELECT id, position_id, recipient_stellar_account_id, principal_minor, payout_minor, status, submitted_tx_hash, confirmed_at FROM prediction_market_settlement_items WHERE settlement_run_id = $1 ORDER BY created_at, id",
    )
    .bind(run_id)
    .fetch_all(pool)
    .await
    .map_err(map_database_error)?;
    Ok(SettlementPlanResponse { run, items })
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

fn require_chain_worker(state: &AppState, headers: &HeaderMap) -> Result<(), ApiError> {
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

async fn require_organization_manager_tx(
    tx: &mut Transaction<'_, Postgres>,
    organization_id: Uuid,
    user_id: Uuid,
) -> Result<(), ApiError> {
    let allowed = sqlx::query_scalar::<_, bool>(
        "SELECT EXISTS (SELECT 1 FROM site_administrators WHERE user_id = $2 AND status = 'active' AND role IN ('owner','admin')) OR EXISTS (SELECT 1 FROM organization_members WHERE organization_id = $1 AND user_id = $2 AND status = 'active' AND role IN ('owner','admin'))",
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

fn validate_tx_hash(value: String) -> Result<String, ApiError> {
    let value = value.trim().to_ascii_lowercase();
    if value.len() == 64 && value.chars().all(|character| character.is_ascii_hexdigit()) {
        Ok(value)
    } else {
        Err(ApiError::InvalidRequest("invalid_market_transaction_hash"))
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
        Err(ApiError::InvalidRequest("invalid_market_source_address"))
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
            Some("23505") => ApiError::Conflict("market_position_or_settlement_already_exists"),
            Some("23503") => ApiError::InvalidRequest("market_related_resource_not_found"),
            Some("23514") | Some("22P02") => {
                ApiError::InvalidRequest("market_settlement_constraint_failed")
            }
            _ => {
                tracing::error!(error = %error, "prediction position database operation failed");
                ApiError::Database
            }
        };
    }
    tracing::error!(error = %error, "prediction position database operation failed");
    ApiError::Database
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn tx_hash_validation_is_strict() {
        assert!(validate_tx_hash("a".repeat(64)).is_ok());
        assert!(validate_tx_hash("z".repeat(64)).is_err());
    }

    #[test]
    fn proportional_allocation_conserves_with_remainder() {
        let total = 10_i64;
        let winning = [3_i64, 2_i64];
        let mut payouts = winning
            .iter()
            .map(|amount| (i128::from(*amount) * i128::from(total) / 5_i128) as i64)
            .collect::<Vec<_>>();
        let mut remainder = total - payouts.iter().sum::<i64>();
        let mut index = 0_usize;
        while remainder > 0 {
            payouts[index] += 1;
            remainder -= 1;
            index = (index + 1) % payouts.len();
        }
        assert_eq!(payouts.iter().sum::<i64>(), total);
    }
}
