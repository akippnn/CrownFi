use axum::{
    extract::{Path, State},
    routing::get,
    Json, Router,
};
use serde::Serialize;
use serde_json::Value;
use sqlx::{FromRow, PgPool};
use time::OffsetDateTime;
use uuid::Uuid;

use crate::{error::ApiError, state::AppState};

pub fn router() -> Router<AppState> {
    Router::new().route(
        "/voting/pageants/:pageant_id/rounds",
        get(list_pageant_rounds),
    )
}

#[derive(Debug, Clone, Serialize, FromRow)]
struct PublicVotingRound {
    id: Uuid,
    pageant_id: Uuid,
    category_id: Uuid,
    slug: String,
    title: String,
    description: Option<String>,
    status: String,
    opens_at: OffsetDateTime,
    closes_at: OffsetDateTime,
    eligibility_json: Value,
    total_votes: i64,
}

#[derive(Debug, Clone, Serialize, FromRow)]
struct PublicRoundContestant {
    pageant_contestant_id: Uuid,
    display_name: String,
    country_code: Option<String>,
    country_representation: Option<String>,
    sash: Option<String>,
    portrait_url: Option<String>,
    sort_order: i32,
}

#[derive(Debug, Clone, Serialize)]
struct PublicRoundView {
    round: PublicVotingRound,
    contestants: Vec<PublicRoundContestant>,
}

async fn list_pageant_rounds(
    State(state): State<AppState>,
    Path(pageant_id): Path<Uuid>,
) -> Result<Json<Vec<PublicRoundView>>, ApiError> {
    let pool = database_pool(&state)?;
    let pageant_visible = sqlx::query_scalar::<_, bool>(
        "SELECT EXISTS (SELECT 1 FROM pageants WHERE id = $1 AND status IN ('published','active','completed'))",
    )
    .bind(pageant_id)
    .fetch_one(pool)
    .await
    .map_err(map_database_error)?;
    if !pageant_visible {
        return Err(ApiError::NotFound);
    }

    let rounds = sqlx::query_as::<_, PublicVotingRound>(
        "SELECT vr.id, vr.pageant_id, vr.category_id, vr.slug, vr.title, vr.description, vr.status, vr.opens_at, vr.closes_at, vr.eligibility_json, COUNT(v.id)::BIGINT AS total_votes FROM voting_rounds vr LEFT JOIN votes v ON v.round_id = vr.id WHERE vr.pageant_id = $1 AND vr.status IN ('scheduled','open','closing','closed','anchored') GROUP BY vr.id ORDER BY CASE vr.status WHEN 'open' THEN 0 WHEN 'scheduled' THEN 1 WHEN 'closing' THEN 2 WHEN 'closed' THEN 3 ELSE 4 END, vr.opens_at DESC, vr.created_at DESC",
    )
    .bind(pageant_id)
    .fetch_all(pool)
    .await
    .map_err(map_database_error)?;

    let mut views = Vec::with_capacity(rounds.len());
    for round in rounds {
        let contestants = sqlx::query_as::<_, PublicRoundContestant>(
            "SELECT pc.id AS pageant_contestant_id, c.display_name, c.country_code, pc.country_representation, pc.sash, ma.public_url AS portrait_url, vrc.sort_order FROM voting_round_contestants vrc JOIN pageant_contestants pc ON pc.id = vrc.pageant_contestant_id JOIN contestants c ON c.id = pc.contestant_id LEFT JOIN contestant_media cm ON cm.pageant_contestant_id = pc.id AND cm.purpose = 'portrait' AND cm.is_primary = true LEFT JOIN media_assets ma ON ma.id = cm.media_asset_id AND ma.status = 'ready' WHERE vrc.round_id = $1 AND pc.status = 'active' ORDER BY vrc.sort_order, c.display_name",
        )
        .bind(round.id)
        .fetch_all(pool)
        .await
        .map_err(map_database_error)?;
        views.push(PublicRoundView { round, contestants });
    }
    Ok(Json(views))
}

fn database_pool(state: &AppState) -> Result<&PgPool, ApiError> {
    state
        .database
        .as_ref()
        .ok_or(ApiError::ServiceUnavailable("database_not_configured"))
}

fn map_database_error(error: sqlx::Error) -> ApiError {
    tracing::error!(error = %error, "public voting discovery failed");
    ApiError::Database
}
