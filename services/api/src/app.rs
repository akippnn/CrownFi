use axum::{
    extract::{Path, State},
    http::{HeaderMap, StatusCode},
    routing::{get, post},
    Json, Router,
};
use serde_json::json;
use sha2::{Digest, Sha256};
use tower_http::{cors::CorsLayer, trace::TraceLayer};
use uuid::Uuid;

use crate::{
    error::ApiError,
    models::{
        AnchorResponse, Contestant, Snapshot, SnapshotRequest, TallyEntry, TallyResponse,
        VerifyResponse, VoteReceipt, VoteRequest,
    },
    state::AppState,
};

pub fn router(state: AppState) -> Router {
    Router::new()
        .route("/health", get(health))
        .route("/ready", get(ready))
        .route("/events", get(list_events))
        .route("/events/:event_id", get(get_event))
        .route("/events/:event_id/contestants", get(list_contestants))
        .route("/events/:event_id/vote", post(submit_vote))
        .route("/events/:event_id/tally", get(get_tally))
        .route("/admin/events/:event_id/snapshot", post(create_snapshot))
        .route(
            "/admin/snapshots/:snapshot_id/anchor",
            post(anchor_snapshot),
        )
        .route("/snapshots/:snapshot_id", get(get_snapshot))
        .route("/snapshots/:snapshot_id/verify", get(verify_snapshot))
        .layer(CorsLayer::permissive())
        .layer(TraceLayer::new_for_http())
        .with_state(state)
}

async fn health(State(state): State<AppState>) -> Json<serde_json::Value> {
    Json(json!({
        "ok": true,
        "service": "crownfi-api",
        "mode": state.config.api_mode,
        "stellar_mode": state.config.stellar_mode,
    }))
}

async fn ready(State(state): State<AppState>) -> Result<Json<serde_json::Value>, ApiError> {
    let database_ok = match state.database.as_ref() {
        Some(pool) => crate::database::ping(pool).await.is_ok(),
        None => false,
    };

    if state.config.database_required && !database_ok {
        return Err(ApiError::ServiceUnavailable("database_unavailable"));
    }

    Ok(Json(json!({
        "ok": true,
        "database_configured": state.config.has_database(),
        "database_reachable": database_ok,
        "redis_configured": state.config.has_redis(),
        "note": "Platform data uses PostgreSQL; voting and market proof-of-flow state remains in memory during migration.",
    })))
}

async fn list_events(State(state): State<AppState>) -> Json<Vec<crate::models::Event>> {
    Json(state.events.values().cloned().collect())
}

async fn get_event(
    State(state): State<AppState>,
    Path(event_id): Path<String>,
) -> Result<Json<crate::models::Event>, ApiError> {
    state
        .events
        .get(&event_id)
        .cloned()
        .map(Json)
        .ok_or(ApiError::NotFound)
}

async fn list_contestants(
    State(state): State<AppState>,
    Path(event_id): Path<String>,
) -> Result<Json<Vec<Contestant>>, ApiError> {
    if !state.events.contains_key(&event_id) {
        return Err(ApiError::NotFound);
    }

    let mut contestants = state
        .contestants
        .values()
        .filter(|contestant| contestant.event_id == event_id)
        .cloned()
        .collect::<Vec<_>>();
    contestants.sort_by(|left, right| left.sash.cmp(&right.sash));

    Ok(Json(contestants))
}

async fn submit_vote(
    State(state): State<AppState>,
    Path(event_id): Path<String>,
    Json(body): Json<VoteRequest>,
) -> Result<(StatusCode, Json<VoteReceipt>), ApiError> {
    let category = state
        .categories
        .get(&body.category_id)
        .ok_or(ApiError::InvalidRequest("category_not_found"))?;

    if category.event_id != event_id {
        return Err(ApiError::InvalidRequest("category_event_mismatch"));
    }

    if category.voting_status != "open" {
        return Err(ApiError::VotingClosed);
    }

    let contestant = state
        .contestants
        .get(&body.contestant_id)
        .ok_or(ApiError::InvalidRequest("contestant_not_found"))?;

    if contestant.event_id != event_id || contestant.category_id != body.category_id {
        return Err(ApiError::InvalidRequest("contestant_category_mismatch"));
    }

    let key = (
        event_id.clone(),
        body.category_id.clone(),
        body.voter_id.clone(),
    );
    let mut votes = state.votes.lock().expect("votes mutex poisoned");
    if !votes.insert(key) {
        return Err(ApiError::DuplicateVote);
    }
    drop(votes);

    let leaf_hash = hash_parts(&[
        &event_id,
        &body.category_id,
        &body.voter_id,
        &body.contestant_id,
    ]);

    let mut tally = state.tally.lock().expect("tally mutex poisoned");
    let bucket = tally
        .entry((event_id.clone(), body.category_id.clone()))
        .or_default();
    *bucket.entry(body.contestant_id.clone()).or_insert(0) += 1;
    drop(tally);

    let receipt = VoteReceipt {
        id: Uuid::new_v4().to_string(),
        event_id,
        category_id: body.category_id,
        voter_id: body.voter_id,
        contestant_id: body.contestant_id,
        leaf_hash,
        mode: state.config.api_mode,
    };

    Ok((StatusCode::CREATED, Json(receipt)))
}

async fn get_tally(
    State(state): State<AppState>,
    Path(event_id): Path<String>,
) -> Result<Json<TallyResponse>, ApiError> {
    if !state.events.contains_key(&event_id) {
        return Err(ApiError::NotFound);
    }

    let category_id = "fan-choice".to_string();
    Ok(Json(build_tally(&state, &event_id, &category_id)))
}

async fn create_snapshot(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(event_id): Path<String>,
    Json(body): Json<SnapshotRequest>,
) -> Result<(StatusCode, Json<Snapshot>), ApiError> {
    require_admin(&state, &headers)?;
    if !state.events.contains_key(&event_id) {
        return Err(ApiError::NotFound);
    }

    let tally = build_tally(&state, &event_id, &body.category_id);
    let canonical = serde_json::to_string(&tally)
        .map_err(|_| ApiError::InvalidRequest("snapshot_serialization_failed"))?;
    let snapshot_hash = sha256_hex(canonical.as_bytes());
    let merkle_root = hash_parts(&[&snapshot_hash, &tally.total_votes.to_string()]);

    let snapshot = Snapshot {
        id: Uuid::new_v4().to_string(),
        event_id,
        category_id: body.category_id,
        snapshot_hash,
        merkle_root,
        total_votes: tally.total_votes,
        anchor_tx: None,
        mode: state.config.stellar_mode.clone(),
    };

    state
        .snapshots
        .lock()
        .expect("snapshots mutex poisoned")
        .insert(snapshot.id.clone(), snapshot.clone());

    Ok((StatusCode::CREATED, Json(snapshot)))
}

async fn anchor_snapshot(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(snapshot_id): Path<String>,
) -> Result<Json<AnchorResponse>, ApiError> {
    require_admin(&state, &headers)?;

    let mut snapshots = state.snapshots.lock().expect("snapshots mutex poisoned");
    let snapshot = snapshots.get_mut(&snapshot_id).ok_or(ApiError::NotFound)?;
    let tx_hash = if state.config.stellar_mode == "live" {
        format!(
            "pending-live-stellar-submit-{}",
            &snapshot.snapshot_hash[..16]
        )
    } else {
        format!("mock-stellar-tx-{}", &snapshot.snapshot_hash[..16])
    };
    snapshot.anchor_tx = Some(tx_hash.clone());

    Ok(Json(AnchorResponse {
        ok: true,
        snapshot_id,
        tx_hash,
        mode: state.config.stellar_mode.clone(),
    }))
}

async fn get_snapshot(
    State(state): State<AppState>,
    Path(snapshot_id): Path<String>,
) -> Result<Json<Snapshot>, ApiError> {
    state
        .snapshots
        .lock()
        .expect("snapshots mutex poisoned")
        .get(&snapshot_id)
        .cloned()
        .map(Json)
        .ok_or(ApiError::NotFound)
}

async fn verify_snapshot(
    State(state): State<AppState>,
    Path(snapshot_id): Path<String>,
) -> Result<Json<VerifyResponse>, ApiError> {
    let snapshot = state
        .snapshots
        .lock()
        .expect("snapshots mutex poisoned")
        .get(&snapshot_id)
        .cloned()
        .ok_or(ApiError::NotFound)?;

    Ok(Json(VerifyResponse {
        ok: snapshot.anchor_tx.is_some(),
        message: if snapshot.anchor_tx.is_some() {
            "Snapshot has an anchor transaction reference.".to_string()
        } else {
            "Snapshot exists but has not been anchored yet.".to_string()
        },
        snapshot,
    }))
}

fn build_tally(state: &AppState, event_id: &str, category_id: &str) -> TallyResponse {
    let tally = state.tally.lock().expect("tally mutex poisoned");
    let mut entries = tally
        .get(&(event_id.to_string(), category_id.to_string()))
        .cloned()
        .unwrap_or_default()
        .into_iter()
        .map(|(contestant_id, votes)| TallyEntry {
            contestant_id,
            votes,
        })
        .collect::<Vec<_>>();
    entries.sort_by(|left, right| {
        right
            .votes
            .cmp(&left.votes)
            .then(left.contestant_id.cmp(&right.contestant_id))
    });
    let total_votes = entries.iter().map(|entry| entry.votes).sum();

    TallyResponse {
        event_id: event_id.to_string(),
        category_id: category_id.to_string(),
        total_votes,
        entries,
    }
}

pub(crate) fn require_admin(state: &AppState, headers: &HeaderMap) -> Result<(), ApiError> {
    let provided = headers
        .get("x-admin-demo-token")
        .and_then(|value| value.to_str().ok())
        .unwrap_or_default();

    if provided == state.config.admin_demo_token {
        Ok(())
    } else {
        Err(ApiError::Unauthorized)
    }
}

fn hash_parts(parts: &[&str]) -> String {
    let joined = parts.join("|");
    sha256_hex(joined.as_bytes())
}

fn sha256_hex(data: &[u8]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(data);
    hex::encode(hasher.finalize())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn hashes_are_stable() {
        assert_eq!(
            hash_parts(&["event", "category", "voter", "contestant"]),
            hash_parts(&["event", "category", "voter", "contestant"])
        );
    }

    #[test]
    fn hashes_change_when_vote_changes() {
        assert_ne!(
            hash_parts(&["event", "category", "voter", "contestant-a"]),
            hash_parts(&["event", "category", "voter", "contestant-b"])
        );
    }
}
