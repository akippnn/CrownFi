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
use time::{format_description::well_known::Rfc3339, OffsetDateTime};
use uuid::Uuid;

use crate::{error::ApiError, state::AppState};

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/voting/rounds", post(create_round))
        .route("/voting/rounds/:round_id", get(get_round))
        .route("/voting/rounds/:round_id/open", post(open_round))
        .route("/voting/rounds/:round_id/close", post(close_round))
        .route("/voting/rounds/:round_id/votes", post(cast_vote))
        .route("/voting/rounds/:round_id/tally", get(get_tally))
}

#[derive(Debug, Clone, Serialize, FromRow)]
struct VotingRoundRecord {
    id: Uuid,
    organization_id: Uuid,
    pageant_id: Uuid,
    category_id: Uuid,
    slug: String,
    title: String,
    description: Option<String>,
    status: String,
    opens_at: OffsetDateTime,
    closes_at: OffsetDateTime,
    max_votes_per_user: i16,
    eligibility_json: Value,
    created_by_user_id: Uuid,
    opened_at: Option<OffsetDateTime>,
    closed_at: Option<OffsetDateTime>,
    created_at: OffsetDateTime,
    updated_at: OffsetDateTime,
}

#[derive(Debug, Clone, Serialize, FromRow)]
struct RoundContestantRecord {
    pageant_contestant_id: Uuid,
    display_name: String,
    sash: Option<String>,
    sort_order: i32,
}

#[derive(Debug, Clone, Serialize)]
struct VotingRoundDetail {
    round: VotingRoundRecord,
    contestants: Vec<RoundContestantRecord>,
}

#[derive(Debug, Deserialize)]
struct CreateRoundRequest {
    organization_id: Uuid,
    pageant_id: Uuid,
    category_id: Uuid,
    slug: String,
    title: String,
    description: Option<String>,
    opens_at: String,
    closes_at: String,
    contestant_ids: Vec<Uuid>,
    #[serde(default)]
    eligibility: Value,
    reason: Option<String>,
}

#[derive(Debug, Deserialize)]
struct TransitionRoundRequest {
    reason: String,
}

#[derive(Debug, Deserialize)]
struct CastVoteRequest {
    pageant_contestant_id: Uuid,
    idempotency_key: String,
}

#[derive(Debug, Clone, Serialize, FromRow)]
struct VoteReceiptRecord {
    vote_id: Uuid,
    round_id: Uuid,
    pageant_contestant_id: Uuid,
    receipt_hash: String,
    accepted_at: OffsetDateTime,
}

#[derive(Debug, Clone, Serialize, FromRow)]
struct TallyEntry {
    pageant_contestant_id: Uuid,
    display_name: String,
    sash: Option<String>,
    votes: i64,
}

#[derive(Debug, Clone, Serialize)]
struct TallyResponse {
    round_id: Uuid,
    status: String,
    total_votes: i64,
    entries: Vec<TallyEntry>,
}

async fn create_round(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(body): Json<CreateRoundRequest>,
) -> Result<(StatusCode, Json<VotingRoundDetail>), ApiError> {
    let actor_user_id = require_web_actor(&state, &headers)?;
    let pool = database_pool(&state)?;
    require_organization_editor(pool, body.organization_id, actor_user_id).await?;

    let slug = validate_slug(body.slug)?;
    let title = required_text(body.title, 200, "invalid_voting_round_title")?;
    let description = optional_text(body.description, 4000, "invalid_voting_round_description")?;
    let opens_at = parse_timestamp(&body.opens_at, "invalid_voting_opens_at")?;
    let closes_at = parse_timestamp(&body.closes_at, "invalid_voting_closes_at")?;
    if closes_at <= opens_at {
        return Err(ApiError::InvalidRequest("voting_close_must_follow_open"));
    }
    if closes_at <= OffsetDateTime::now_utc() {
        return Err(ApiError::InvalidRequest("voting_close_must_be_future"));
    }
    if !body.eligibility.is_object() {
        return Err(ApiError::InvalidRequest("invalid_voting_eligibility"));
    }

    let unique_contestants = body.contestant_ids.iter().copied().collect::<HashSet<_>>();
    if unique_contestants.len() != body.contestant_ids.len() || unique_contestants.len() < 2 {
        return Err(ApiError::InvalidRequest(
            "voting_round_requires_unique_contestants",
        ));
    }

    let pageant_valid = sqlx::query_scalar::<_, bool>(
        "SELECT EXISTS (SELECT 1 FROM pageants p JOIN categories c ON c.pageant_id = p.id WHERE p.id = $1 AND p.organization_id = $2 AND c.id = $3)",
    )
    .bind(body.pageant_id)
    .bind(body.organization_id)
    .bind(body.category_id)
    .fetch_one(pool)
    .await
    .map_err(map_database_error)?;
    if !pageant_valid {
        return Err(ApiError::InvalidRequest("voting_pageant_category_mismatch"));
    }

    let mut tx = pool.begin().await.map_err(map_database_error)?;
    for contestant_id in &body.contestant_ids {
        let eligible = sqlx::query_scalar::<_, bool>(
            "SELECT EXISTS (SELECT 1 FROM pageant_contestants pc JOIN contestant_category_memberships ccm ON ccm.pageant_contestant_id = pc.id WHERE pc.id = $1 AND pc.pageant_id = $2 AND pc.status = 'active' AND ccm.category_id = $3)",
        )
        .bind(contestant_id)
        .bind(body.pageant_id)
        .bind(body.category_id)
        .fetch_one(&mut *tx)
        .await
        .map_err(map_database_error)?;
        if !eligible {
            return Err(ApiError::InvalidRequest("voting_contestant_not_eligible"));
        }
    }

    let round_id = Uuid::new_v4();
    sqlx::query(
        "INSERT INTO voting_rounds (id, organization_id, pageant_id, category_id, slug, title, description, status, opens_at, closes_at, eligibility_json, created_by_user_id) VALUES ($1,$2,$3,$4,$5,$6,$7,'scheduled',$8,$9,$10,$11)",
    )
    .bind(round_id)
    .bind(body.organization_id)
    .bind(body.pageant_id)
    .bind(body.category_id)
    .bind(&slug)
    .bind(&title)
    .bind(&description)
    .bind(opens_at)
    .bind(closes_at)
    .bind(&body.eligibility)
    .bind(actor_user_id)
    .execute(&mut *tx)
    .await
    .map_err(map_database_error)?;

    for (sort_order, contestant_id) in body.contestant_ids.iter().enumerate() {
        sqlx::query(
            "INSERT INTO voting_round_contestants (round_id, pageant_contestant_id, sort_order) VALUES ($1,$2,$3)",
        )
        .bind(round_id)
        .bind(contestant_id)
        .bind(i32::try_from(sort_order).map_err(|_| ApiError::InvalidRequest("too_many_voting_contestants"))?)
        .execute(&mut *tx)
        .await
        .map_err(map_database_error)?;
    }

    write_round_event(
        &mut tx,
        body.organization_id,
        round_id,
        actor_user_id,
        "create",
        None,
        "scheduled",
        body.reason.as_deref().unwrap_or("Voting round configured."),
        json!({"pageant_id": body.pageant_id, "category_id": body.category_id}),
    )
    .await?;
    write_audit(
        &mut tx,
        body.organization_id,
        actor_user_id,
        "voting_round.create",
        round_id,
        json!({"slug": slug, "contestant_count": body.contestant_ids.len()}),
    )
    .await?;
    tx.commit().await.map_err(map_database_error)?;

    Ok((StatusCode::CREATED, Json(load_round(pool, round_id).await?)))
}

async fn get_round(
    State(state): State<AppState>,
    Path(round_id): Path<Uuid>,
) -> Result<Json<VotingRoundDetail>, ApiError> {
    Ok(Json(load_round(database_pool(&state)?, round_id).await?))
}

async fn open_round(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(round_id): Path<Uuid>,
    Json(body): Json<TransitionRoundRequest>,
) -> Result<Json<VotingRoundDetail>, ApiError> {
    transition_round(&state, &headers, round_id, body.reason, true).await
}

async fn close_round(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(round_id): Path<Uuid>,
    Json(body): Json<TransitionRoundRequest>,
) -> Result<Json<VotingRoundDetail>, ApiError> {
    transition_round(&state, &headers, round_id, body.reason, false).await
}

async fn transition_round(
    state: &AppState,
    headers: &HeaderMap,
    round_id: Uuid,
    reason: String,
    opening: bool,
) -> Result<Json<VotingRoundDetail>, ApiError> {
    let actor_user_id = require_web_actor(state, headers)?;
    let pool = database_pool(state)?;
    let reason = required_text(reason, 1000, "invalid_voting_transition_reason")?;
    let mut tx = pool.begin().await.map_err(map_database_error)?;
    let current = sqlx::query_as::<_, (Uuid, String, OffsetDateTime, OffsetDateTime)>(
        "SELECT organization_id, status, opens_at, closes_at FROM voting_rounds WHERE id = $1 FOR UPDATE",
    )
    .bind(round_id)
    .fetch_optional(&mut *tx)
    .await
    .map_err(map_database_error)?
    .ok_or(ApiError::NotFound)?;
    require_organization_editor_tx(&mut tx, current.0, actor_user_id).await?;

    let now = OffsetDateTime::now_utc();
    let (action, target_status) = if opening {
        if !matches!(current.1.as_str(), "draft" | "scheduled") {
            return Err(ApiError::Conflict("voting_round_not_openable"));
        }
        if now < current.2 {
            return Err(ApiError::Conflict("voting_round_not_started"));
        }
        if now >= current.3 {
            return Err(ApiError::Conflict("voting_round_expired"));
        }
        sqlx::query("UPDATE voting_rounds SET status = 'open', opened_at = COALESCE(opened_at, now()), updated_at = now() WHERE id = $1")
            .bind(round_id)
            .execute(&mut *tx)
            .await
            .map_err(map_database_error)?;
        ("open", "open")
    } else {
        if !matches!(current.1.as_str(), "open" | "closing") {
            return Err(ApiError::Conflict("voting_round_not_closable"));
        }
        sqlx::query("UPDATE voting_rounds SET status = 'closed', closed_at = COALESCE(closed_at, now()), updated_at = now() WHERE id = $1")
            .bind(round_id)
            .execute(&mut *tx)
            .await
            .map_err(map_database_error)?;
        ("close", "closed")
    };

    write_round_event(
        &mut tx,
        current.0,
        round_id,
        actor_user_id,
        action,
        Some(&current.1),
        target_status,
        &reason,
        json!({}),
    )
    .await?;
    write_audit(
        &mut tx,
        current.0,
        actor_user_id,
        &format!("voting_round.{action}"),
        round_id,
        json!({"previous_status": current.1, "new_status": target_status}),
    )
    .await?;
    tx.commit().await.map_err(map_database_error)?;
    Ok(Json(load_round(pool, round_id).await?))
}

async fn cast_vote(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(round_id): Path<Uuid>,
    Json(body): Json<CastVoteRequest>,
) -> Result<(StatusCode, Json<VoteReceiptRecord>), ApiError> {
    let voter_user_id = require_web_actor(&state, &headers)?;
    let pool = database_pool(&state)?;
    let idempotency_key = required_text(body.idempotency_key, 200, "invalid_vote_idempotency_key")?;
    let request_sha256 = hash_text(&format!(
        "round={round_id};voter={voter_user_id};contestant={};key={idempotency_key}",
        body.pageant_contestant_id
    ));

    let mut tx = pool.begin().await.map_err(map_database_error)?;
    let round = sqlx::query_as::<_, (Uuid, Uuid, String, OffsetDateTime, OffsetDateTime)>(
        "SELECT organization_id, pageant_id, status, opens_at, closes_at FROM voting_rounds WHERE id = $1",
    )
    .bind(round_id)
    .fetch_optional(&mut *tx)
    .await
    .map_err(map_database_error)?
    .ok_or(ApiError::NotFound)?;

    let now = OffsetDateTime::now_utc();
    if round.2 != "open" || now < round.3 || now >= round.4 {
        return Err(ApiError::VotingClosed);
    }

    let voter_active = sqlx::query_scalar::<_, bool>(
        "SELECT EXISTS (SELECT 1 FROM users u WHERE u.id = $1 AND u.status = 'active') AND EXISTS (SELECT 1 FROM stellar_accounts sa WHERE sa.user_id = $1 AND sa.network = 'testnet' AND sa.verified_at IS NOT NULL)",
    )
    .bind(voter_user_id)
    .fetch_one(&mut *tx)
    .await
    .map_err(map_database_error)?;
    if !voter_active {
        return Err(ApiError::Forbidden);
    }

    let contestant_allowed = sqlx::query_scalar::<_, bool>(
        "SELECT EXISTS (SELECT 1 FROM voting_round_contestants vrc JOIN pageant_contestants pc ON pc.id = vrc.pageant_contestant_id WHERE vrc.round_id = $1 AND vrc.pageant_contestant_id = $2 AND pc.pageant_id = $3 AND pc.status = 'active')",
    )
    .bind(round_id)
    .bind(body.pageant_contestant_id)
    .bind(round.1)
    .fetch_one(&mut *tx)
    .await
    .map_err(map_database_error)?;
    if !contestant_allowed {
        return Err(ApiError::InvalidRequest("contestant_not_in_voting_round"));
    }

    if let Some(existing) = sqlx::query_as::<_, VoteReceiptRecord>(
        "SELECT id AS vote_id, round_id, pageant_contestant_id, receipt_hash, accepted_at FROM votes WHERE round_id = $1 AND voter_user_id = $2 AND idempotency_key = $3",
    )
    .bind(round_id)
    .bind(voter_user_id)
    .bind(&idempotency_key)
    .fetch_optional(&mut *tx)
    .await
    .map_err(map_database_error)?
    {
        let existing_hash = sqlx::query_scalar::<_, String>("SELECT request_sha256 FROM votes WHERE id = $1")
            .bind(existing.vote_id)
            .fetch_one(&mut *tx)
            .await
            .map_err(map_database_error)?;
        if existing_hash != request_sha256 {
            return Err(ApiError::Conflict("vote_idempotency_key_reused"));
        }
        tx.commit().await.map_err(map_database_error)?;
        return Ok((StatusCode::OK, Json(existing)));
    }

    let vote_id = Uuid::new_v4();
    let receipt_hash = hash_text(&format!(
        "vote={vote_id};round={round_id};voter={voter_user_id};contestant={};request={request_sha256}",
        body.pageant_contestant_id
    ));
    let accepted_at = OffsetDateTime::now_utc();
    let inserted = sqlx::query(
        "INSERT INTO votes (id, organization_id, pageant_id, round_id, pageant_contestant_id, voter_user_id, idempotency_key, request_sha256, receipt_hash, accepted_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)",
    )
    .bind(vote_id)
    .bind(round.0)
    .bind(round.1)
    .bind(round_id)
    .bind(body.pageant_contestant_id)
    .bind(voter_user_id)
    .bind(&idempotency_key)
    .bind(&request_sha256)
    .bind(&receipt_hash)
    .bind(accepted_at)
    .execute(&mut *tx)
    .await;
    if let Err(error) = inserted {
        if is_unique_violation(&error) {
            return Err(ApiError::DuplicateVote);
        }
        return Err(map_database_error(error));
    }

    write_audit(
        &mut tx,
        round.0,
        voter_user_id,
        "vote.accept",
        vote_id,
        json!({"round_id": round_id, "receipt_hash": receipt_hash}),
    )
    .await?;
    tx.commit().await.map_err(map_database_error)?;

    Ok((
        StatusCode::CREATED,
        Json(VoteReceiptRecord {
            vote_id,
            round_id,
            pageant_contestant_id: body.pageant_contestant_id,
            receipt_hash,
            accepted_at,
        }),
    ))
}

async fn get_tally(
    State(state): State<AppState>,
    Path(round_id): Path<Uuid>,
) -> Result<Json<TallyResponse>, ApiError> {
    let pool = database_pool(&state)?;
    let status = sqlx::query_scalar::<_, String>("SELECT status FROM voting_rounds WHERE id = $1")
        .bind(round_id)
        .fetch_optional(pool)
        .await
        .map_err(map_database_error)?
        .ok_or(ApiError::NotFound)?;
    if !matches!(status.as_str(), "closed" | "anchored") {
        return Err(ApiError::Conflict("voting_tally_not_published"));
    }

    let entries = sqlx::query_as::<_, TallyEntry>(
        "SELECT pc.id AS pageant_contestant_id, c.display_name, pc.sash, COUNT(v.id)::BIGINT AS votes FROM voting_round_contestants vrc JOIN pageant_contestants pc ON pc.id = vrc.pageant_contestant_id JOIN contestants c ON c.id = pc.contestant_id LEFT JOIN votes v ON v.round_id = vrc.round_id AND v.pageant_contestant_id = pc.id WHERE vrc.round_id = $1 GROUP BY pc.id, c.display_name, pc.sash, vrc.sort_order ORDER BY votes DESC, vrc.sort_order, c.display_name",
    )
    .bind(round_id)
    .fetch_all(pool)
    .await
    .map_err(map_database_error)?;
    let total_votes = entries.iter().map(|entry| entry.votes).sum();
    Ok(Json(TallyResponse {
        round_id,
        status,
        total_votes,
        entries,
    }))
}

async fn load_round(pool: &PgPool, round_id: Uuid) -> Result<VotingRoundDetail, ApiError> {
    let round = sqlx::query_as::<_, VotingRoundRecord>(
        "SELECT id, organization_id, pageant_id, category_id, slug, title, description, status, opens_at, closes_at, max_votes_per_user, eligibility_json, created_by_user_id, opened_at, closed_at, created_at, updated_at FROM voting_rounds WHERE id = $1",
    )
    .bind(round_id)
    .fetch_optional(pool)
    .await
    .map_err(map_database_error)?
    .ok_or(ApiError::NotFound)?;
    let contestants = sqlx::query_as::<_, RoundContestantRecord>(
        "SELECT pc.id AS pageant_contestant_id, c.display_name, pc.sash, vrc.sort_order FROM voting_round_contestants vrc JOIN pageant_contestants pc ON pc.id = vrc.pageant_contestant_id JOIN contestants c ON c.id = pc.contestant_id WHERE vrc.round_id = $1 ORDER BY vrc.sort_order, c.display_name",
    )
    .bind(round_id)
    .fetch_all(pool)
    .await
    .map_err(map_database_error)?;
    Ok(VotingRoundDetail { round, contestants })
}

async fn write_round_event(
    tx: &mut Transaction<'_, Postgres>,
    organization_id: Uuid,
    round_id: Uuid,
    actor_user_id: Uuid,
    action: &str,
    previous_status: Option<&str>,
    new_status: &str,
    reason: &str,
    metadata: Value,
) -> Result<(), ApiError> {
    sqlx::query(
        "INSERT INTO voting_round_events (id, organization_id, round_id, actor_user_id, action, previous_status, new_status, reason, metadata) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)",
    )
    .bind(Uuid::new_v4())
    .bind(organization_id)
    .bind(round_id)
    .bind(actor_user_id)
    .bind(action)
    .bind(previous_status)
    .bind(new_status)
    .bind(reason)
    .bind(metadata)
    .execute(&mut **tx)
    .await
    .map_err(map_database_error)?;
    Ok(())
}

async fn write_audit(
    tx: &mut Transaction<'_, Postgres>,
    organization_id: Uuid,
    actor_user_id: Uuid,
    action: &str,
    entity_id: Uuid,
    metadata: Value,
) -> Result<(), ApiError> {
    sqlx::query(
        "INSERT INTO audit_logs (id, organization_id, actor_user_id, action, entity_type, entity_id, metadata) VALUES ($1,$2,$3,$4,'voting',$5,$6)",
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

async fn require_organization_editor(
    pool: &PgPool,
    organization_id: Uuid,
    user_id: Uuid,
) -> Result<(), ApiError> {
    let allowed = sqlx::query_scalar::<_, bool>(
        "SELECT EXISTS (SELECT 1 FROM site_administrators WHERE user_id = $2 AND status = 'active' AND role IN ('owner','admin')) OR EXISTS (SELECT 1 FROM organization_members WHERE organization_id = $1 AND user_id = $2 AND status = 'active' AND role IN ('owner','admin','editor'))",
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

fn parse_timestamp(value: &str, code: &'static str) -> Result<OffsetDateTime, ApiError> {
    OffsetDateTime::parse(value.trim(), &Rfc3339).map_err(|_| ApiError::InvalidRequest(code))
}

fn validate_slug(value: String) -> Result<String, ApiError> {
    let value = value.trim().to_ascii_lowercase();
    let valid = !value.is_empty()
        && value.len() <= 120
        && value.split('-').all(|part| {
            !part.is_empty()
                && part
                    .chars()
                    .all(|character| character.is_ascii_lowercase() || character.is_ascii_digit())
        });
    if valid {
        Ok(value)
    } else {
        Err(ApiError::InvalidRequest("invalid_voting_round_slug"))
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

fn optional_text(
    value: Option<String>,
    max: usize,
    code: &'static str,
) -> Result<Option<String>, ApiError> {
    value
        .map(|value| required_text(value, max, code))
        .transpose()
}

fn hash_text(value: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(value.as_bytes());
    hex::encode(hasher.finalize())
}

fn is_unique_violation(error: &sqlx::Error) -> bool {
    error
        .as_database_error()
        .and_then(|database_error| database_error.code())
        .is_some_and(|code| code == "23505")
}

fn map_database_error(error: sqlx::Error) -> ApiError {
    if let Some(database_error) = error.as_database_error() {
        let code = database_error.code().map(|code| code.into_owned());
        return match code.as_deref() {
            Some("23505") => ApiError::Conflict("voting_resource_already_exists"),
            Some("23503") => ApiError::InvalidRequest("voting_related_resource_not_found"),
            Some("23514") | Some("22P02") => ApiError::InvalidRequest("voting_constraint_failed"),
            _ => {
                tracing::error!(error = %error, "voting database operation failed");
                ApiError::Database
            }
        };
    }
    tracing::error!(error = %error, "voting database operation failed");
    ApiError::Database
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn receipt_material_is_stable() {
        assert_eq!(
            hash_text("round|user|contestant"),
            hash_text("round|user|contestant")
        );
    }

    #[test]
    fn slugs_are_normalized() {
        assert_eq!(
            validate_slug("Fan-Choice-2026".into()).unwrap(),
            "fan-choice-2026"
        );
        assert!(validate_slug("fan choice".into()).is_err());
    }
}
