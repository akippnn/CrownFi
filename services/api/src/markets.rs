use std::time::{SystemTime, UNIX_EPOCH};

use axum::{
    extract::{Path, State},
    http::{HeaderMap, StatusCode},
    routing::{get, post},
    Json, Router,
};
use uuid::Uuid;

use crate::{
    error::ApiError,
    models::{
        CreateStakeIntentRequest, MarketTransactionIntent, PredictionMarketProjection,
        SubmitMarketIntentRequest,
    },
    state::AppState,
};

const INTENT_TTL_SECONDS: u64 = 15 * 60;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/markets", get(list_markets))
        .route("/markets/:market_id", get(get_market))
        .route("/markets/:market_id/stake-intents", post(create_stake_intent))
        .route("/market-intents/:intent_id", get(get_market_intent))
        .route("/market-intents/:intent_id/submission", post(record_submission))
}

async fn list_markets(
    State(state): State<AppState>,
) -> Json<Vec<PredictionMarketProjection>> {
    let mut markets = state
        .markets
        .lock()
        .expect("markets mutex poisoned")
        .values()
        .cloned()
        .collect::<Vec<_>>();
    markets.sort_by(|left, right| left.id.cmp(&right.id));
    Json(markets)
}

async fn get_market(
    State(state): State<AppState>,
    Path(market_id): Path<String>,
) -> Result<Json<PredictionMarketProjection>, ApiError> {
    state
        .markets
        .lock()
        .expect("markets mutex poisoned")
        .get(&market_id)
        .cloned()
        .map(Json)
        .ok_or(ApiError::NotFound)
}

async fn create_stake_intent(
    State(state): State<AppState>,
    Path(market_id): Path<String>,
    headers: HeaderMap,
    Json(body): Json<CreateStakeIntentRequest>,
) -> Result<(StatusCode, Json<MarketTransactionIntent>), ApiError> {
    let idempotency_key = headers
        .get("idempotency-key")
        .and_then(|value| value.to_str().ok())
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .ok_or(ApiError::InvalidRequest("idempotency_key_required"))?
        .to_string();

    if body.amount <= 0 {
        return Err(ApiError::InvalidRequest("amount_must_be_positive"));
    }
    if body.wallet_address.trim().is_empty() {
        return Err(ApiError::InvalidRequest("wallet_address_required"));
    }

    let market = state
        .markets
        .lock()
        .expect("markets mutex poisoned")
        .get(&market_id)
        .cloned()
        .ok_or(ApiError::NotFound)?;

    if market.status != "open" {
        return Err(ApiError::InvalidRequest("market_not_open"));
    }
    if body.option as usize >= market.options.len() {
        return Err(ApiError::InvalidRequest("invalid_market_option"));
    }

    let dedupe_key = format!("{}:{}", body.wallet_address, idempotency_key);
    if let Some(existing_id) = state
        .market_intent_keys
        .lock()
        .expect("market intent keys mutex poisoned")
        .get(&dedupe_key)
        .cloned()
    {
        let existing = state
            .market_intents
            .lock()
            .expect("market intents mutex poisoned")
            .get(&existing_id)
            .cloned()
            .ok_or(ApiError::NotFound)?;
        return Ok((StatusCode::OK, Json(existing)));
    }

    let now = unix_now()?;
    if now >= market.closes_at_unix {
        return Err(ApiError::InvalidRequest("market_closed"));
    }

    let intent = MarketTransactionIntent {
        id: Uuid::new_v4().to_string(),
        market_id,
        wallet_address: body.wallet_address,
        option: body.option,
        amount: body.amount,
        idempotency_key,
        status: "prepared".to_string(),
        created_at_unix: now,
        expires_at_unix: now.saturating_add(INTENT_TTL_SECONDS),
        submitted_tx_hash: None,
        network: "testnet".to_string(),
    };

    state
        .market_intent_keys
        .lock()
        .expect("market intent keys mutex poisoned")
        .insert(dedupe_key, intent.id.clone());
    state
        .market_intents
        .lock()
        .expect("market intents mutex poisoned")
        .insert(intent.id.clone(), intent.clone());

    Ok((StatusCode::CREATED, Json(intent)))
}

async fn get_market_intent(
    State(state): State<AppState>,
    Path(intent_id): Path<String>,
) -> Result<Json<MarketTransactionIntent>, ApiError> {
    let mut intents = state
        .market_intents
        .lock()
        .expect("market intents mutex poisoned");
    let intent = intents.get_mut(&intent_id).ok_or(ApiError::NotFound)?;
    if intent.status == "prepared" && is_expired(intent.expires_at_unix, unix_now()?) {
        intent.status = "expired".to_string();
    }
    Ok(Json(intent.clone()))
}

async fn record_submission(
    State(state): State<AppState>,
    Path(intent_id): Path<String>,
    Json(body): Json<SubmitMarketIntentRequest>,
) -> Result<Json<MarketTransactionIntent>, ApiError> {
    let tx_hash = body.tx_hash.trim();
    if tx_hash.len() < 16 || tx_hash.len() > 128 {
        return Err(ApiError::InvalidRequest("invalid_transaction_hash"));
    }

    let now = unix_now()?;
    let mut intents = state
        .market_intents
        .lock()
        .expect("market intents mutex poisoned");
    let intent = intents.get_mut(&intent_id).ok_or(ApiError::NotFound)?;

    if is_expired(intent.expires_at_unix, now) {
        intent.status = "expired".to_string();
        return Err(ApiError::InvalidRequest("intent_expired"));
    }
    if let Some(existing) = &intent.submitted_tx_hash {
        if existing == tx_hash {
            return Ok(Json(intent.clone()));
        }
        return Err(ApiError::InvalidRequest("intent_already_submitted"));
    }

    intent.submitted_tx_hash = Some(tx_hash.to_string());
    intent.status = "submitted_unconfirmed".to_string();
    Ok(Json(intent.clone()))
}

fn unix_now() -> Result<u64, ApiError> {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs())
        .map_err(|_| ApiError::InvalidRequest("clock_before_unix_epoch"))
}

fn is_expired(expires_at: u64, now: u64) -> bool {
    now >= expires_at
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn expiry_is_inclusive() {
        assert!(!is_expired(100, 99));
        assert!(is_expired(100, 100));
        assert!(is_expired(100, 101));
    }
}
