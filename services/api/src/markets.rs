use std::collections::HashSet;

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
use time::{format_description::well_known::Rfc3339, Duration, OffsetDateTime};
use uuid::Uuid;

use crate::{app::require_admin, error::ApiError, state::AppState};

const STAKE_INTENT_TTL_MINUTES: i64 = 15;
const PUBLIC_MARKET_STATUSES: &[&str] = &[
    "approved",
    "open",
    "paused",
    "closed",
    "resolution_pending",
    "resolved",
    "cancelled",
    "settling",
    "settled",
    "archived",
];

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/markets", get(list_markets))
        .route("/markets/:market_id", get(get_market))
        .route(
            "/markets/:market_id/stake-intents",
            post(create_stake_intent),
        )
        .route("/market-intents/:intent_id", get(get_market_intent))
        .route(
            "/market-intents/:intent_id/submission",
            post(record_submission),
        )
        .route("/internal/markets", post(create_market))
        .route(
            "/internal/markets/:market_id/policy-decisions",
            post(record_policy_decision),
        )
        .route(
            "/internal/markets/:market_id/transitions",
            post(transition_market),
        )
}

#[derive(Debug, Clone, Serialize, FromRow)]
struct MarketRecord {
    id: Uuid,
    organization_id: Uuid,
    pageant_id: Option<Uuid>,
    slug: String,
    question: String,
    description: Option<String>,
    status: String,
    network: String,
    asset_code: String,
    asset_scale: i16,
    asset_issuer: Option<String>,
    fee_bps: i32,
    min_stake_minor: i64,
    max_stake_minor: i64,
    max_user_exposure_minor: i64,
    max_market_exposure_minor: i64,
    opens_at: OffsetDateTime,
    closes_at: OffsetDateTime,
    resolution_source: String,
    policy_version: String,
    winning_outcome_id: Option<Uuid>,
    result_evidence: Value,
    created_by_user_id: Uuid,
    approved_by_user_id: Option<Uuid>,
    approved_at: Option<OffsetDateTime>,
    resolved_by_user_id: Option<Uuid>,
    resolved_at: Option<OffsetDateTime>,
    created_at: OffsetDateTime,
    updated_at: OffsetDateTime,
}

#[derive(Debug, Clone, Serialize, FromRow)]
struct OutcomeRecord {
    id: Uuid,
    market_id: Uuid,
    code: String,
    label: String,
    sort_order: i32,
    total_active_minor: i64,
    created_at: OffsetDateTime,
}

#[derive(Debug, Clone, Serialize)]
struct MarketDetail {
    market: MarketRecord,
    outcomes: Vec<OutcomeRecord>,
}

#[derive(Debug, Deserialize)]
struct OutcomeInput {
    code: String,
    label: String,
}

#[derive(Debug, Deserialize)]
struct CreateMarketRequest {
    organization_id: Uuid,
    pageant_id: Option<Uuid>,
    slug: String,
    question: String,
    description: Option<String>,
    asset_code: String,
    asset_scale: i16,
    asset_issuer: Option<String>,
    fee_bps: i32,
    min_stake_minor: i64,
    max_stake_minor: i64,
    max_user_exposure_minor: i64,
    max_market_exposure_minor: i64,
    opens_at: String,
    closes_at: String,
    resolution_source: String,
    policy_version: String,
    outcomes: Vec<OutcomeInput>,
}

#[derive(Debug, Clone, Serialize, FromRow)]
struct PolicyDecisionRecord {
    id: Uuid,
    organization_id: Uuid,
    market_id: Uuid,
    subject_user_id: Option<Uuid>,
    action: String,
    decision: String,
    reason: String,
    policy_version: String,
    decided_by_user_id: Uuid,
    expires_at: Option<OffsetDateTime>,
    created_at: OffsetDateTime,
}

#[derive(Debug, Deserialize)]
struct PolicyDecisionRequest {
    subject_user_id: Option<Uuid>,
    action: String,
    decision: String,
    reason: String,
    policy_version: String,
    expires_at: Option<String>,
}

#[derive(Debug, Deserialize)]
struct TransitionMarketRequest {
    target_status: String,
    reason: String,
    winning_outcome_id: Option<Uuid>,
    #[serde(default)]
    evidence: Value,
}

#[derive(Debug, Deserialize)]
struct CreateStakeIntentRequest {
    outcome_id: Uuid,
    wallet_address: String,
    amount_minor: i64,
}

#[derive(Debug, Clone, Serialize, FromRow)]
struct StakeIntentRecord {
    id: Uuid,
    organization_id: Uuid,
    market_id: Uuid,
    outcome_id: Uuid,
    user_id: Uuid,
    stellar_account_id: Uuid,
    amount_minor: i64,
    idempotency_key: String,
    request_sha256: String,
    status: String,
    submitted_tx_hash: Option<String>,
    expires_at: OffsetDateTime,
    submitted_at: Option<OffsetDateTime>,
    confirmed_at: Option<OffsetDateTime>,
    rejection_code: Option<String>,
    created_at: OffsetDateTime,
    updated_at: OffsetDateTime,
}

#[derive(Debug, Deserialize)]
struct SubmitMarketIntentRequest {
    tx_hash: String,
}

async fn list_markets(
    State(state): State<AppState>,
) -> Result<Json<Vec<MarketDetail>>, ApiError> {
    let pool = database_pool(&state)?;
    let records = sqlx::query_as::<_, MarketRecord>(
        "SELECT id, organization_id, pageant_id, slug, question, description, status, network, asset_code, asset_scale, asset_issuer, fee_bps, min_stake_minor, max_stake_minor, max_user_exposure_minor, max_market_exposure_minor, opens_at, closes_at, resolution_source, policy_version, winning_outcome_id, result_evidence, created_by_user_id, approved_by_user_id, approved_at, resolved_by_user_id, resolved_at, created_at, updated_at FROM prediction_markets WHERE status = ANY($1) ORDER BY CASE status WHEN 'open' THEN 0 WHEN 'approved' THEN 1 WHEN 'paused' THEN 2 ELSE 3 END, closes_at, created_at DESC",
    )
    .bind(PUBLIC_MARKET_STATUSES)
    .fetch_all(pool)
    .await
    .map_err(map_database_error)?;

    let mut markets = Vec::with_capacity(records.len());
    for market in records {
        let outcomes = fetch_outcomes(pool, market.id).await?;
        markets.push(MarketDetail { market, outcomes });
    }
    Ok(Json(markets))
}

async fn get_market(
    State(state): State<AppState>,
    Path(market_id): Path<Uuid>,
) -> Result<Json<MarketDetail>, ApiError> {
    let pool = database_pool(&state)?;
    let detail = fetch_market_detail(pool, market_id, true).await?;
    Ok(Json(detail))
}

async fn create_market(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(body): Json<CreateMarketRequest>,
) -> Result<(StatusCode, Json<MarketDetail>), ApiError> {
    require_admin(&state, &headers)?;
    let actor_user_id = actor_user_id(&headers)?;
    let pool = database_pool(&state)?;
    require_organization_editor(pool, body.organization_id, actor_user_id).await?;

    let slug = validate_slug(body.slug)?;
    let question = validate_text(body.question, 8, 500, "invalid_market_question")?;
    let description = optional_text(body.description, 4000, "invalid_market_description")?;
    let resolution_source = validate_text(
        body.resolution_source,
        8,
        1000,
        "invalid_resolution_source",
    )?;
    let policy_version = validate_text(body.policy_version, 1, 120, "invalid_policy_version")?;
    let opens_at = parse_timestamp(&body.opens_at, "invalid_opens_at")?;
    let closes_at = parse_timestamp(&body.closes_at, "invalid_closes_at")?;
    if closes_at <= opens_at {
        return Err(ApiError::InvalidRequest("market_close_must_follow_open"));
    }
    if closes_at <= OffsetDateTime::now_utc() {
        return Err(ApiError::InvalidRequest("market_close_must_be_future"));
    }

    validate_limits(&body)?;
    let (asset_code, asset_issuer) = validate_asset(body.asset_code, body.asset_issuer)?;
    let outcomes = validate_outcomes(body.outcomes)?;

    if let Some(pageant_id) = body.pageant_id {
        let pageant_matches = sqlx::query_scalar::<_, bool>(
            "SELECT EXISTS (SELECT 1 FROM pageants WHERE id = $1 AND organization_id = $2)",
        )
        .bind(pageant_id)
        .bind(body.organization_id)
        .fetch_one(pool)
        .await
        .map_err(map_database_error)?;
        if !pageant_matches {
            return Err(ApiError::InvalidRequest("pageant_organization_mismatch"));
        }
    }

    let market_id = Uuid::new_v4();
    let mut tx = pool.begin().await.map_err(map_database_error)?;
    sqlx::query(
        "INSERT INTO prediction_markets (id, organization_id, pageant_id, slug, question, description, status, network, asset_code, asset_scale, asset_issuer, fee_bps, min_stake_minor, max_stake_minor, max_user_exposure_minor, max_market_exposure_minor, opens_at, closes_at, resolution_source, policy_version, created_by_user_id) VALUES ($1,$2,$3,$4,$5,$6,'draft','testnet',$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)",
    )
    .bind(market_id)
    .bind(body.organization_id)
    .bind(body.pageant_id)
    .bind(&slug)
    .bind(&question)
    .bind(&description)
    .bind(&asset_code)
    .bind(body.asset_scale)
    .bind(&asset_issuer)
    .bind(body.fee_bps)
    .bind(body.min_stake_minor)
    .bind(body.max_stake_minor)
    .bind(body.max_user_exposure_minor)
    .bind(body.max_market_exposure_minor)
    .bind(opens_at)
    .bind(closes_at)
    .bind(&resolution_source)
    .bind(&policy_version)
    .bind(actor_user_id)
    .execute(&mut *tx)
    .await
    .map_err(map_database_error)?;

    for (sort_order, (code, label)) in outcomes.iter().enumerate() {
        sqlx::query(
            "INSERT INTO prediction_market_outcomes (id, market_id, code, label, sort_order) VALUES ($1,$2,$3,$4,$5)",
        )
        .bind(Uuid::new_v4())
        .bind(market_id)
        .bind(code)
        .bind(label)
        .bind(i32::try_from(sort_order).map_err(|_| ApiError::InvalidRequest("too_many_outcomes"))?)
        .execute(&mut *tx)
        .await
        .map_err(map_database_error)?;
    }

    insert_governance_event(
        &mut tx,
        body.organization_id,
        market_id,
        actor_user_id,
        "market.create",
        None,
        Some("draft"),
        "Market draft created for policy review.",
        json!({"policy_version": policy_version}),
    )
    .await?;
    insert_audit(
        &mut tx,
        body.organization_id,
        actor_user_id,
        "prediction_market.create",
        market_id,
        json!({"slug": slug, "outcome_count": outcomes.len(), "network": "testnet"}),
    )
    .await?;
    tx.commit().await.map_err(map_database_error)?;

    Ok((
        StatusCode::CREATED,
        Json(fetch_market_detail(pool, market_id, false).await?),
    ))
}

async fn record_policy_decision(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(market_id): Path<Uuid>,
    Json(body): Json<PolicyDecisionRequest>,
) -> Result<(StatusCode, Json<PolicyDecisionRecord>), ApiError> {
    require_admin(&state, &headers)?;
    let actor_user_id = actor_user_id(&headers)?;
    let pool = database_pool(&state)?;
    require_site_administrator(pool, actor_user_id).await?;
    let market = fetch_market_record(pool, market_id).await?;

    let action = validate_policy_action(body.action)?;
    let decision = validate_policy_decision(body.decision)?;
    let reason = validate_text(body.reason, 3, 1000, "invalid_policy_reason")?;
    let policy_version = validate_text(body.policy_version, 1, 120, "invalid_policy_version")?;
    let expires_at = body
        .expires_at
        .as_deref()
        .map(|value| parse_timestamp(value, "invalid_policy_expiry"))
        .transpose()?;
    if expires_at.is_some_and(|expiry| expiry <= OffsetDateTime::now_utc()) {
        return Err(ApiError::InvalidRequest("policy_expiry_must_be_future"));
    }
    if (action == "stake") != body.subject_user_id.is_some() {
        return Err(ApiError::InvalidRequest("policy_subject_mismatch"));
    }

    if let Some(subject_user_id) = body.subject_user_id {
        let user_exists = sqlx::query_scalar::<_, bool>(
            "SELECT EXISTS (SELECT 1 FROM users WHERE id = $1 AND status = 'active')",
        )
        .bind(subject_user_id)
        .fetch_one(pool)
        .await
        .map_err(map_database_error)?;
        if !user_exists {
            return Err(ApiError::InvalidRequest("policy_subject_not_found"));
        }
    }

    let id = Uuid::new_v4();
    let mut tx = pool.begin().await.map_err(map_database_error)?;
    let decision_record = sqlx::query_as::<_, PolicyDecisionRecord>(
        "INSERT INTO prediction_market_policy_decisions (id, organization_id, market_id, subject_user_id, action, decision, reason, policy_version, decided_by_user_id, expires_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id, organization_id, market_id, subject_user_id, action, decision, reason, policy_version, decided_by_user_id, expires_at, created_at",
    )
    .bind(id)
    .bind(market.organization_id)
    .bind(market_id)
    .bind(body.subject_user_id)
    .bind(&action)
    .bind(&decision)
    .bind(&reason)
    .bind(&policy_version)
    .bind(actor_user_id)
    .bind(expires_at)
    .fetch_one(&mut *tx)
    .await
    .map_err(map_database_error)?;

    insert_audit(
        &mut tx,
        market.organization_id,
        actor_user_id,
        "prediction_market.policy_decide",
        market_id,
        json!({
            "action": action,
            "decision": decision,
            "subject_user_id": body.subject_user_id,
            "policy_version": policy_version
        }),
    )
    .await?;
    tx.commit().await.map_err(map_database_error)?;
    Ok((StatusCode::CREATED, Json(decision_record)))
}

async fn transition_market(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(market_id): Path<Uuid>,
    Json(body): Json<TransitionMarketRequest>,
) -> Result<Json<MarketDetail>, ApiError> {
    require_admin(&state, &headers)?;
    let actor_user_id = actor_user_id(&headers)?;
    let pool = database_pool(&state)?;
    let market = fetch_market_record(pool, market_id).await?;
    let target = body.target_status.trim().to_ascii_lowercase();
    let reason = validate_text(body.reason, 3, 1000, "invalid_transition_reason")?;

    if target == "pending_review" {
        require_organization_editor(pool, market.organization_id, actor_user_id).await?;
    } else {
        require_site_administrator(pool, actor_user_id).await?;
    }
    if !valid_transition(&market.status, &target) {
        return Err(ApiError::Conflict("invalid_market_transition"));
    }

    let now = OffsetDateTime::now_utc();
    match target.as_str() {
        "open" => {
            if now < market.opens_at || now >= market.closes_at {
                return Err(ApiError::Conflict("market_outside_open_window"));
            }
            require_policy_allow(pool, market_id, None, "market.open").await?;
        }
        "resolution_pending" => {
            if now < market.closes_at {
                return Err(ApiError::Conflict("market_still_open"));
            }
            require_policy_allow(pool, market_id, None, "resolve").await?;
        }
        "resolved" => {
            require_policy_allow(pool, market_id, None, "resolve").await?;
            let outcome_id = body
                .winning_outcome_id
                .ok_or(ApiError::InvalidRequest("winning_outcome_required"))?;
            require_outcome(pool, market_id, outcome_id).await?;
            if !body.evidence.is_object() || body.evidence.as_object().is_some_and(|value| value.is_empty()) {
                return Err(ApiError::InvalidRequest("resolution_evidence_required"));
            }
        }
        "settling" => require_policy_allow(pool, market_id, None, "settle").await?,
        _ => {}
    }

    let evidence = if body.evidence.is_null() {
        json!({})
    } else if body.evidence.is_object() {
        body.evidence
    } else {
        return Err(ApiError::InvalidRequest("transition_evidence_must_be_object"));
    };

    let mut tx = pool.begin().await.map_err(map_database_error)?;
    sqlx::query(
        "UPDATE prediction_markets SET status = $2, winning_outcome_id = CASE WHEN $2 = 'resolved' THEN $3 ELSE winning_outcome_id END, result_evidence = CASE WHEN $2 IN ('resolved','cancelled') THEN $4 ELSE result_evidence END, approved_by_user_id = CASE WHEN $2 = 'approved' THEN $5 ELSE approved_by_user_id END, approved_at = CASE WHEN $2 = 'approved' THEN now() ELSE approved_at END, resolved_by_user_id = CASE WHEN $2 IN ('resolved','cancelled') THEN $5 ELSE resolved_by_user_id END, resolved_at = CASE WHEN $2 IN ('resolved','cancelled') THEN now() ELSE resolved_at END, updated_at = now() WHERE id = $1",
    )
    .bind(market_id)
    .bind(&target)
    .bind(body.winning_outcome_id)
    .bind(&evidence)
    .bind(actor_user_id)
    .execute(&mut *tx)
    .await
    .map_err(map_database_error)?;

    insert_governance_event(
        &mut tx,
        market.organization_id,
        market_id,
        actor_user_id,
        "market.transition",
        Some(&market.status),
        Some(&target),
        &reason,
        evidence.clone(),
    )
    .await?;
    insert_audit(
        &mut tx,
        market.organization_id,
        actor_user_id,
        "prediction_market.transition",
        market_id,
        json!({"from": market.status, "to": target, "reason": reason}),
    )
    .await?;
    tx.commit().await.map_err(map_database_error)?;

    Ok(Json(fetch_market_detail(pool, market_id, false).await?))
}

async fn create_stake_intent(
    State(state): State<AppState>,
    Path(market_id): Path<Uuid>,
    headers: HeaderMap,
    Json(body): Json<CreateStakeIntentRequest>,
) -> Result<(StatusCode, Json<StakeIntentRecord>), ApiError> {
    require_server_boundary(&state, &headers)?;
    let user_id = actor_user_id(&headers)?;
    let pool = database_pool(&state)?;
    let market = fetch_market_record(pool, market_id).await?;
    let idempotency_key = idempotency_key(&headers)?;
    let now = OffsetDateTime::now_utc();

    if market.status != "open" {
        return Err(ApiError::Conflict("market_not_open"));
    }
    if now < market.opens_at || now >= market.closes_at {
        return Err(ApiError::Conflict("market_closed"));
    }
    if body.amount_minor < market.min_stake_minor || body.amount_minor > market.max_stake_minor {
        return Err(ApiError::InvalidRequest("stake_amount_outside_limits"));
    }
    require_outcome(pool, market_id, body.outcome_id).await?;
    require_policy_allow(pool, market_id, Some(user_id), "stake").await?;

    let wallet_address = validate_stellar_address(body.wallet_address)?;
    let stellar_account_id = sqlx::query_scalar::<_, Uuid>(
        "SELECT id FROM stellar_accounts WHERE user_id = $1 AND network = 'testnet' AND address = $2 AND verified_at IS NOT NULL",
    )
    .bind(user_id)
    .bind(&wallet_address)
    .fetch_optional(pool)
    .await
    .map_err(map_database_error)?
    .ok_or(ApiError::Forbidden)?;

    let request_sha256 = hash_parts(&[
        &market_id.to_string(),
        &body.outcome_id.to_string(),
        &user_id.to_string(),
        &wallet_address,
        &body.amount_minor.to_string(),
    ]);

    if let Some(existing) = sqlx::query_as::<_, StakeIntentRecord>(
        "SELECT id, organization_id, market_id, outcome_id, user_id, stellar_account_id, amount_minor, idempotency_key, request_sha256, status, submitted_tx_hash, expires_at, submitted_at, confirmed_at, rejection_code, created_at, updated_at FROM prediction_market_stake_intents WHERE organization_id = $1 AND user_id = $2 AND idempotency_key = $3",
    )
    .bind(market.organization_id)
    .bind(user_id)
    .bind(&idempotency_key)
    .fetch_optional(pool)
    .await
    .map_err(map_database_error)?
    {
        if existing.request_sha256 == request_sha256 {
            return Ok((StatusCode::OK, Json(existing)));
        }
        return Err(ApiError::Conflict("idempotency_key_reused_with_changed_request"));
    }

    let user_exposure = current_user_exposure(pool, market_id, user_id).await?;
    let next_user_exposure = user_exposure
        .checked_add(body.amount_minor)
        .ok_or(ApiError::InvalidRequest("exposure_overflow"))?;
    if next_user_exposure > market.max_user_exposure_minor {
        return Err(ApiError::Conflict("user_exposure_limit_exceeded"));
    }
    let market_exposure = current_market_exposure(pool, market_id).await?;
    let next_market_exposure = market_exposure
        .checked_add(body.amount_minor)
        .ok_or(ApiError::InvalidRequest("exposure_overflow"))?;
    if next_market_exposure > market.max_market_exposure_minor {
        return Err(ApiError::Conflict("market_exposure_limit_exceeded"));
    }

    let requested_expiry = now + Duration::minutes(STAKE_INTENT_TTL_MINUTES);
    let expires_at = if requested_expiry < market.closes_at {
        requested_expiry
    } else {
        market.closes_at
    };
    let intent_id = Uuid::new_v4();
    let mut tx = pool.begin().await.map_err(map_database_error)?;
    let intent = sqlx::query_as::<_, StakeIntentRecord>(
        "INSERT INTO prediction_market_stake_intents (id, organization_id, market_id, outcome_id, user_id, stellar_account_id, amount_minor, idempotency_key, request_sha256, status, expires_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'awaiting_signature',$10) RETURNING id, organization_id, market_id, outcome_id, user_id, stellar_account_id, amount_minor, idempotency_key, request_sha256, status, submitted_tx_hash, expires_at, submitted_at, confirmed_at, rejection_code, created_at, updated_at",
    )
    .bind(intent_id)
    .bind(market.organization_id)
    .bind(market_id)
    .bind(body.outcome_id)
    .bind(user_id)
    .bind(stellar_account_id)
    .bind(body.amount_minor)
    .bind(&idempotency_key)
    .bind(&request_sha256)
    .bind(expires_at)
    .fetch_one(&mut *tx)
    .await
    .map_err(map_database_error)?;

    insert_audit(
        &mut tx,
        market.organization_id,
        user_id,
        "prediction_market.stake_intent_create",
        market_id,
        json!({
            "intent_id": intent_id,
            "outcome_id": body.outcome_id,
            "amount_minor": body.amount_minor,
            "wallet_suffix": &wallet_address[wallet_address.len() - 6..],
            "network": "testnet"
        }),
    )
    .await?;
    tx.commit().await.map_err(map_database_error)?;
    Ok((StatusCode::CREATED, Json(intent)))
}

async fn get_market_intent(
    State(state): State<AppState>,
    Path(intent_id): Path<Uuid>,
    headers: HeaderMap,
) -> Result<Json<StakeIntentRecord>, ApiError> {
    require_server_boundary(&state, &headers)?;
    let actor_user_id = actor_user_id(&headers)?;
    let pool = database_pool(&state)?;
    expire_intent_if_needed(pool, intent_id).await?;
    let intent = fetch_stake_intent(pool, intent_id).await?;
    require_intent_access(pool, &intent, actor_user_id).await?;
    Ok(Json(intent))
}

async fn record_submission(
    State(state): State<AppState>,
    Path(intent_id): Path<Uuid>,
    headers: HeaderMap,
    Json(body): Json<SubmitMarketIntentRequest>,
) -> Result<Json<StakeIntentRecord>, ApiError> {
    require_server_boundary(&state, &headers)?;
    let actor_user_id = actor_user_id(&headers)?;
    let pool = database_pool(&state)?;
    expire_intent_if_needed(pool, intent_id).await?;
    let intent = fetch_stake_intent(pool, intent_id).await?;
    require_intent_access(pool, &intent, actor_user_id).await?;

    if intent.status == "expired" {
        return Err(ApiError::Conflict("stake_intent_expired"));
    }
    if !["awaiting_signature", "signed", "submitted"].contains(&intent.status.as_str()) {
        return Err(ApiError::Conflict("stake_intent_not_submittable"));
    }
    let tx_hash = body.tx_hash.trim().to_ascii_lowercase();
    if tx_hash.len() != 64 || !tx_hash.chars().all(|character| character.is_ascii_hexdigit()) {
        return Err(ApiError::InvalidRequest("invalid_transaction_hash"));
    }
    if let Some(existing) = &intent.submitted_tx_hash {
        if existing == &tx_hash {
            return Ok(Json(intent));
        }
        return Err(ApiError::Conflict("stake_intent_already_submitted"));
    }

    sqlx::query(
        "UPDATE prediction_market_stake_intents SET status = 'submitted', submitted_tx_hash = $2, submitted_at = now(), updated_at = now() WHERE id = $1",
    )
    .bind(intent_id)
    .bind(&tx_hash)
    .execute(pool)
    .await
    .map_err(map_database_error)?;

    Ok(Json(fetch_stake_intent(pool, intent_id).await?))
}

async fn fetch_market_record(pool: &PgPool, market_id: Uuid) -> Result<MarketRecord, ApiError> {
    sqlx::query_as::<_, MarketRecord>(
        "SELECT id, organization_id, pageant_id, slug, question, description, status, network, asset_code, asset_scale, asset_issuer, fee_bps, min_stake_minor, max_stake_minor, max_user_exposure_minor, max_market_exposure_minor, opens_at, closes_at, resolution_source, policy_version, winning_outcome_id, result_evidence, created_by_user_id, approved_by_user_id, approved_at, resolved_by_user_id, resolved_at, created_at, updated_at FROM prediction_markets WHERE id = $1",
    )
    .bind(market_id)
    .fetch_optional(pool)
    .await
    .map_err(map_database_error)?
    .ok_or(ApiError::NotFound)
}

async fn fetch_market_detail(
    pool: &PgPool,
    market_id: Uuid,
    public_only: bool,
) -> Result<MarketDetail, ApiError> {
    let market = fetch_market_record(pool, market_id).await?;
    if public_only && !PUBLIC_MARKET_STATUSES.contains(&market.status.as_str()) {
        return Err(ApiError::NotFound);
    }
    let outcomes = fetch_outcomes(pool, market_id).await?;
    Ok(MarketDetail { market, outcomes })
}

async fn fetch_outcomes(pool: &PgPool, market_id: Uuid) -> Result<Vec<OutcomeRecord>, ApiError> {
    sqlx::query_as::<_, OutcomeRecord>(
        "SELECT id, market_id, code, label, sort_order, total_active_minor, created_at FROM prediction_market_outcomes WHERE market_id = $1 ORDER BY sort_order, id",
    )
    .bind(market_id)
    .fetch_all(pool)
    .await
    .map_err(map_database_error)
}

async fn fetch_stake_intent(
    pool: &PgPool,
    intent_id: Uuid,
) -> Result<StakeIntentRecord, ApiError> {
    sqlx::query_as::<_, StakeIntentRecord>(
        "SELECT id, organization_id, market_id, outcome_id, user_id, stellar_account_id, amount_minor, idempotency_key, request_sha256, status, submitted_tx_hash, expires_at, submitted_at, confirmed_at, rejection_code, created_at, updated_at FROM prediction_market_stake_intents WHERE id = $1",
    )
    .bind(intent_id)
    .fetch_optional(pool)
    .await
    .map_err(map_database_error)?
    .ok_or(ApiError::NotFound)
}

async fn expire_intent_if_needed(pool: &PgPool, intent_id: Uuid) -> Result<(), ApiError> {
    sqlx::query(
        "UPDATE prediction_market_stake_intents SET status = 'expired', updated_at = now() WHERE id = $1 AND status IN ('awaiting_signature','signed') AND expires_at <= now()",
    )
    .bind(intent_id)
    .execute(pool)
    .await
    .map_err(map_database_error)?;
    Ok(())
}

async fn require_intent_access(
    pool: &PgPool,
    intent: &StakeIntentRecord,
    actor_user_id: Uuid,
) -> Result<(), ApiError> {
    if intent.user_id == actor_user_id || is_site_administrator(pool, actor_user_id).await? {
        Ok(())
    } else {
        Err(ApiError::Forbidden)
    }
}

async fn require_outcome(pool: &PgPool, market_id: Uuid, outcome_id: Uuid) -> Result<(), ApiError> {
    let exists = sqlx::query_scalar::<_, bool>(
        "SELECT EXISTS (SELECT 1 FROM prediction_market_outcomes WHERE market_id = $1 AND id = $2)",
    )
    .bind(market_id)
    .bind(outcome_id)
    .fetch_one(pool)
    .await
    .map_err(map_database_error)?;
    if exists {
        Ok(())
    } else {
        Err(ApiError::InvalidRequest("market_outcome_not_found"))
    }
}

async fn require_policy_allow(
    pool: &PgPool,
    market_id: Uuid,
    subject_user_id: Option<Uuid>,
    action: &str,
) -> Result<(), ApiError> {
    let decision = sqlx::query_scalar::<_, String>(
        "SELECT decision FROM prediction_market_policy_decisions WHERE market_id = $1 AND action = $2 AND subject_user_id IS NOT DISTINCT FROM $3 AND (expires_at IS NULL OR expires_at > now()) ORDER BY created_at DESC, id DESC LIMIT 1",
    )
    .bind(market_id)
    .bind(action)
    .bind(subject_user_id)
    .fetch_optional(pool)
    .await
    .map_err(map_database_error)?;
    match decision.as_deref() {
        Some("allow") => Ok(()),
        _ => Err(ApiError::Forbidden),
    }
}

async fn current_user_exposure(
    pool: &PgPool,
    market_id: Uuid,
    user_id: Uuid,
) -> Result<i64, ApiError> {
    sqlx::query_scalar::<_, i64>(
        "SELECT COALESCE((SELECT SUM(amount_minor) FROM prediction_market_positions WHERE market_id = $1 AND user_id = $2 AND status IN ('pending','active')),0)::bigint + COALESCE((SELECT SUM(amount_minor) FROM prediction_market_stake_intents WHERE market_id = $1 AND user_id = $2 AND status IN ('awaiting_signature','signed','submitted') AND expires_at > now()),0)::bigint",
    )
    .bind(market_id)
    .bind(user_id)
    .fetch_one(pool)
    .await
    .map_err(map_database_error)
}

async fn current_market_exposure(pool: &PgPool, market_id: Uuid) -> Result<i64, ApiError> {
    sqlx::query_scalar::<_, i64>(
        "SELECT COALESCE((SELECT SUM(amount_minor) FROM prediction_market_positions WHERE market_id = $1 AND status IN ('pending','active')),0)::bigint + COALESCE((SELECT SUM(amount_minor) FROM prediction_market_stake_intents WHERE market_id = $1 AND status IN ('awaiting_signature','signed','submitted') AND expires_at > now()),0)::bigint",
    )
    .bind(market_id)
    .fetch_one(pool)
    .await
    .map_err(map_database_error)
}

async fn require_organization_editor(
    pool: &PgPool,
    organization_id: Uuid,
    actor_user_id: Uuid,
) -> Result<(), ApiError> {
    let allowed = sqlx::query_scalar::<_, bool>(
        "SELECT EXISTS (SELECT 1 FROM site_administrators WHERE user_id = $2 AND status = 'active') OR EXISTS (SELECT 1 FROM organization_members WHERE organization_id = $1 AND user_id = $2 AND status = 'active' AND role IN ('owner','admin','editor'))",
    )
    .bind(organization_id)
    .bind(actor_user_id)
    .fetch_one(pool)
    .await
    .map_err(map_database_error)?;
    if allowed {
        Ok(())
    } else {
        Err(ApiError::Forbidden)
    }
}

async fn require_site_administrator(pool: &PgPool, actor_user_id: Uuid) -> Result<(), ApiError> {
    if is_site_administrator(pool, actor_user_id).await? {
        Ok(())
    } else {
        Err(ApiError::Forbidden)
    }
}

async fn is_site_administrator(pool: &PgPool, actor_user_id: Uuid) -> Result<bool, ApiError> {
    sqlx::query_scalar::<_, bool>(
        "SELECT EXISTS (SELECT 1 FROM site_administrators WHERE user_id = $1 AND status = 'active')",
    )
    .bind(actor_user_id)
    .fetch_one(pool)
    .await
    .map_err(map_database_error)
}

async fn insert_governance_event(
    tx: &mut Transaction<'_, Postgres>,
    organization_id: Uuid,
    market_id: Uuid,
    actor_user_id: Uuid,
    action: &str,
    previous_status: Option<&str>,
    new_status: Option<&str>,
    reason: &str,
    evidence: Value,
) -> Result<(), ApiError> {
    sqlx::query(
        "INSERT INTO prediction_market_governance_events (id, organization_id, market_id, actor_user_id, action, previous_status, new_status, reason, evidence) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)",
    )
    .bind(Uuid::new_v4())
    .bind(organization_id)
    .bind(market_id)
    .bind(actor_user_id)
    .bind(action)
    .bind(previous_status)
    .bind(new_status)
    .bind(reason)
    .bind(evidence)
    .execute(&mut **tx)
    .await
    .map_err(map_database_error)?;
    Ok(())
}

async fn insert_audit(
    tx: &mut Transaction<'_, Postgres>,
    organization_id: Uuid,
    actor_user_id: Uuid,
    action: &str,
    market_id: Uuid,
    metadata: Value,
) -> Result<(), ApiError> {
    sqlx::query(
        "INSERT INTO audit_logs (id, organization_id, actor_user_id, action, entity_type, entity_id, metadata) VALUES ($1,$2,$3,$4,'prediction_market',$5,$6)",
    )
    .bind(Uuid::new_v4())
    .bind(organization_id)
    .bind(actor_user_id)
    .bind(action)
    .bind(market_id)
    .bind(metadata)
    .execute(&mut **tx)
    .await
    .map_err(map_database_error)?;
    Ok(())
}

fn database_pool(state: &AppState) -> Result<&PgPool, ApiError> {
    state
        .database
        .as_ref()
        .ok_or(ApiError::ServiceUnavailable("database_not_configured"))
}

fn require_server_boundary(state: &AppState, headers: &HeaderMap) -> Result<(), ApiError> {
    let internal = headers
        .get("x-crownfi-web-token")
        .and_then(|value| value.to_str().ok())
        .unwrap_or_default();
    if !state.config.web_internal_token.is_empty() && internal == state.config.web_internal_token {
        return Ok(());
    }

    let local_admin = headers
        .get("x-admin-demo-token")
        .and_then(|value| value.to_str().ok())
        .unwrap_or_default();
    if state.config.api_mode.starts_with("local") && local_admin == state.config.admin_demo_token {
        return Ok(());
    }
    Err(ApiError::Unauthorized)
}

fn actor_user_id(headers: &HeaderMap) -> Result<Uuid, ApiError> {
    headers
        .get("x-crownfi-user-id")
        .and_then(|value| value.to_str().ok())
        .and_then(|value| Uuid::parse_str(value.trim()).ok())
        .ok_or(ApiError::Unauthorized)
}

fn idempotency_key(headers: &HeaderMap) -> Result<String, ApiError> {
    headers
        .get("idempotency-key")
        .and_then(|value| value.to_str().ok())
        .map(str::trim)
        .filter(|value| !value.is_empty() && value.len() <= 200)
        .map(str::to_string)
        .ok_or(ApiError::InvalidRequest("idempotency_key_required"))
}

fn validate_limits(body: &CreateMarketRequest) -> Result<(), ApiError> {
    if body.asset_scale < 0
        || body.asset_scale > 7
        || body.fee_bps < 0
        || body.fee_bps > 1000
        || body.min_stake_minor <= 0
        || body.max_stake_minor < body.min_stake_minor
        || body.max_user_exposure_minor < body.max_stake_minor
        || body.max_market_exposure_minor < body.max_user_exposure_minor
    {
        Err(ApiError::InvalidRequest("invalid_market_limits"))
    } else {
        Ok(())
    }
}

fn validate_asset(
    asset_code: String,
    asset_issuer: Option<String>,
) -> Result<(String, Option<String>), ApiError> {
    let asset_code = asset_code.trim().to_ascii_uppercase();
    if asset_code.is_empty()
        || asset_code.len() > 12
        || !asset_code.chars().all(|character| character.is_ascii_alphanumeric())
    {
        return Err(ApiError::InvalidRequest("invalid_asset_code"));
    }
    if asset_code == "XLM" {
        if asset_issuer.as_deref().is_some_and(|value| !value.trim().is_empty()) {
            return Err(ApiError::InvalidRequest("xlm_must_not_have_issuer"));
        }
        Ok((asset_code, None))
    } else {
        let issuer = asset_issuer.ok_or(ApiError::InvalidRequest("asset_issuer_required"))?;
        Ok((asset_code, Some(validate_stellar_address(issuer)?)))
    }
}

fn validate_outcomes(outcomes: Vec<OutcomeInput>) -> Result<Vec<(String, String)>, ApiError> {
    if !(2..=32).contains(&outcomes.len()) {
        return Err(ApiError::InvalidRequest("market_requires_two_to_thirty_two_outcomes"));
    }
    let mut codes = HashSet::new();
    let mut result = Vec::with_capacity(outcomes.len());
    for outcome in outcomes {
        let code = outcome.code.trim().to_ascii_uppercase();
        if code.is_empty()
            || code.len() > 32
            || !code
                .chars()
                .all(|character| character.is_ascii_uppercase() || character.is_ascii_digit() || matches!(character, '_' | '-'))
            || !code
                .chars()
                .next()
                .is_some_and(|character| character.is_ascii_uppercase() || character.is_ascii_digit())
        {
            return Err(ApiError::InvalidRequest("invalid_market_outcome_code"));
        }
        if !codes.insert(code.clone()) {
            return Err(ApiError::InvalidRequest("duplicate_market_outcome_code"));
        }
        let label = validate_text(outcome.label, 1, 160, "invalid_market_outcome_label")?;
        result.push((code, label));
    }
    Ok(result)
}

fn validate_policy_action(value: String) -> Result<String, ApiError> {
    let value = value.trim().to_ascii_lowercase();
    if ["market.open", "stake", "resolve", "settle", "refund"].contains(&value.as_str()) {
        Ok(value)
    } else {
        Err(ApiError::InvalidRequest("invalid_policy_action"))
    }
}

fn validate_policy_decision(value: String) -> Result<String, ApiError> {
    let value = value.trim().to_ascii_lowercase();
    if ["allow", "deny", "review"].contains(&value.as_str()) {
        Ok(value)
    } else {
        Err(ApiError::InvalidRequest("invalid_policy_decision"))
    }
}

fn validate_slug(value: String) -> Result<String, ApiError> {
    let value = value.trim().to_ascii_lowercase();
    let valid = !value.is_empty()
        && value.len() <= 120
        && !value.starts_with('-')
        && !value.ends_with('-')
        && !value.contains("--")
        && value
            .chars()
            .all(|character| character.is_ascii_lowercase() || character.is_ascii_digit() || character == '-');
    if valid {
        Ok(value)
    } else {
        Err(ApiError::InvalidRequest("invalid_market_slug"))
    }
}

fn validate_text(
    value: String,
    min: usize,
    max: usize,
    error: &'static str,
) -> Result<String, ApiError> {
    let value = value.trim().to_string();
    if (min..=max).contains(&value.chars().count()) {
        Ok(value)
    } else {
        Err(ApiError::InvalidRequest(error))
    }
}

fn optional_text(
    value: Option<String>,
    max: usize,
    error: &'static str,
) -> Result<Option<String>, ApiError> {
    match value.map(|value| value.trim().to_string()) {
        Some(value) if value.is_empty() => Ok(None),
        Some(value) if value.chars().count() <= max => Ok(Some(value)),
        Some(_) => Err(ApiError::InvalidRequest(error)),
        None => Ok(None),
    }
}

fn parse_timestamp(value: &str, error: &'static str) -> Result<OffsetDateTime, ApiError> {
    OffsetDateTime::parse(value.trim(), &Rfc3339).map_err(|_| ApiError::InvalidRequest(error))
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
        Err(ApiError::InvalidRequest("invalid_stellar_address"))
    }
}

fn valid_transition(current: &str, target: &str) -> bool {
    matches!(
        (current, target),
        ("draft", "pending_review")
            | ("pending_review", "approved")
            | ("pending_review", "cancelled")
            | ("approved", "open")
            | ("approved", "cancelled")
            | ("open", "paused")
            | ("open", "closed")
            | ("open", "cancelled")
            | ("paused", "open")
            | ("paused", "closed")
            | ("paused", "cancelled")
            | ("closed", "resolution_pending")
            | ("closed", "cancelled")
            | ("resolution_pending", "resolved")
            | ("resolution_pending", "cancelled")
            | ("resolved", "settling")
            | ("settling", "settled")
            | ("settled", "archived")
            | ("cancelled", "archived")
    )
}

fn hash_parts(parts: &[&str]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(parts.join("|").as_bytes());
    hex::encode(hasher.finalize())
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
                tracing::error!(error = %error, "prediction-market database operation failed");
                ApiError::Database
            }
        };
    }
    tracing::error!(error = %error, "prediction-market database operation failed");
    ApiError::Database
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn lifecycle_is_fail_closed() {
        assert!(valid_transition("draft", "pending_review"));
        assert!(valid_transition("approved", "open"));
        assert!(valid_transition("resolution_pending", "resolved"));
        assert!(!valid_transition("draft", "open"));
        assert!(!valid_transition("open", "resolved"));
        assert!(!valid_transition("settled", "open"));
    }

    #[test]
    fn request_hash_changes_with_material_stake_fields() {
        let original = hash_parts(&["market", "outcome-a", "user", "wallet", "100"]);
        let changed = hash_parts(&["market", "outcome-b", "user", "wallet", "100"]);
        assert_ne!(original, changed);
    }

    #[test]
    fn address_validation_rejects_non_stellar_input() {
        assert!(validate_stellar_address(
            "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF".to_string()
        )
        .is_ok());
        assert!(validate_stellar_address("not-a-wallet".to_string()).is_err());
    }
}
