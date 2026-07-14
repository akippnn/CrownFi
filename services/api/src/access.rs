use axum::{
    extract::{Path, State},
    http::{HeaderMap, StatusCode},
    routing::{get, post},
    Json, Router,
};
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, PgPool};
use time::OffsetDateTime;
use uuid::Uuid;

use crate::{error::ApiError, state::AppState};

pub fn router() -> Router<AppState> {
    Router::new()
        .route(
            "/internal/access/organizations/:organization_id/members/:actor_user_id",
            get(list_members),
        )
        .route(
            "/internal/access/organizations/:organization_id/members",
            post(grant_membership),
        )
}

#[derive(Debug, Clone, Serialize, FromRow)]
struct MemberRecord {
    user_id: Uuid,
    display_name: String,
    email: Option<String>,
    role: String,
    status: String,
    primary_wallet: Option<String>,
    created_at: OffsetDateTime,
    updated_at: OffsetDateTime,
}

#[derive(Debug, Deserialize)]
struct GrantMembershipRequest {
    actor_user_id: Uuid,
    wallet_address: String,
    network: String,
    role: String,
}

async fn list_members(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((organization_id, actor_user_id)): Path<(Uuid, Uuid)>,
) -> Result<Json<Vec<MemberRecord>>, ApiError> {
    require_internal(&state, &headers)?;
    let pool = database_pool(&state)?;
    require_organization_manager(pool, organization_id, actor_user_id).await?;
    let members = sqlx::query_as::<_, MemberRecord>(
        "SELECT om.user_id, u.display_name, u.email, om.role, om.status, (SELECT sa.address FROM stellar_accounts sa WHERE sa.user_id = u.id AND sa.is_primary ORDER BY sa.created_at LIMIT 1) AS primary_wallet, om.created_at, om.updated_at FROM organization_members om JOIN users u ON u.id = om.user_id WHERE om.organization_id = $1 AND om.status <> 'removed' ORDER BY CASE om.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 WHEN 'editor' THEN 2 ELSE 3 END, u.display_name",
    )
    .bind(organization_id)
    .fetch_all(pool)
    .await
    .map_err(map_database_error)?;
    Ok(Json(members))
}

async fn grant_membership(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(organization_id): Path<Uuid>,
    Json(body): Json<GrantMembershipRequest>,
) -> Result<(StatusCode, Json<MemberRecord>), ApiError> {
    require_internal(&state, &headers)?;
    let pool = database_pool(&state)?;
    require_organization_manager(pool, organization_id, body.actor_user_id).await?;
    let address = validate_address(body.wallet_address)?;
    let network = validate_network(body.network)?;
    let role = validate_role(body.role)?;

    let target_user_id = sqlx::query_scalar::<_, Uuid>(
        "SELECT user_id FROM stellar_accounts WHERE network = $1 AND address = $2 AND verified_at IS NOT NULL",
    )
    .bind(&network)
    .bind(&address)
    .fetch_optional(pool)
    .await
    .map_err(map_database_error)?
    .ok_or(ApiError::InvalidRequest("target_account_must_sign_in_first"))?;

    let mut tx = pool.begin().await.map_err(map_database_error)?;
    sqlx::query(
        "INSERT INTO organization_members (organization_id, user_id, role, status, invited_by_user_id) VALUES ($1,$2,$3,'active',$4) ON CONFLICT (organization_id, user_id) DO UPDATE SET role = EXCLUDED.role, status = 'active', invited_by_user_id = EXCLUDED.invited_by_user_id, updated_at = now()",
    )
    .bind(organization_id)
    .bind(target_user_id)
    .bind(&role)
    .bind(body.actor_user_id)
    .execute(&mut *tx)
    .await
    .map_err(map_database_error)?;
    sqlx::query(
        "INSERT INTO audit_logs (id, organization_id, actor_user_id, action, entity_type, entity_id, metadata) VALUES ($1,$2,$3,'organization_member.grant','user',$4,jsonb_build_object('role',$5,'wallet_suffix',right($6,6),'network',$7))",
    )
    .bind(Uuid::new_v4())
    .bind(organization_id)
    .bind(body.actor_user_id)
    .bind(target_user_id)
    .bind(&role)
    .bind(&address)
    .bind(&network)
    .execute(&mut *tx)
    .await
    .map_err(map_database_error)?;
    tx.commit().await.map_err(map_database_error)?;

    let member = sqlx::query_as::<_, MemberRecord>(
        "SELECT om.user_id, u.display_name, u.email, om.role, om.status, (SELECT sa.address FROM stellar_accounts sa WHERE sa.user_id = u.id AND sa.is_primary ORDER BY sa.created_at LIMIT 1) AS primary_wallet, om.created_at, om.updated_at FROM organization_members om JOIN users u ON u.id = om.user_id WHERE om.organization_id = $1 AND om.user_id = $2",
    )
    .bind(organization_id)
    .bind(target_user_id)
    .fetch_one(pool)
    .await
    .map_err(map_database_error)?;
    Ok((StatusCode::CREATED, Json(member)))
}

async fn require_organization_manager(
    pool: &PgPool,
    organization_id: Uuid,
    user_id: Uuid,
) -> Result<(), ApiError> {
    let allowed = sqlx::query_scalar::<_, bool>(
        "SELECT EXISTS (SELECT 1 FROM site_administrators WHERE user_id = $2 AND status = 'active') OR EXISTS (SELECT 1 FROM organization_members WHERE organization_id = $1 AND user_id = $2 AND status = 'active' AND role IN ('owner','admin'))",
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

fn database_pool(state: &AppState) -> Result<&PgPool, ApiError> {
    state
        .database
        .as_ref()
        .ok_or(ApiError::ServiceUnavailable("database_not_configured"))
}

fn require_internal(state: &AppState, headers: &HeaderMap) -> Result<(), ApiError> {
    let provided = headers
        .get("x-crownfi-web-token")
        .and_then(|value| value.to_str().ok())
        .unwrap_or_default();
    if !state.config.web_internal_token.is_empty() && provided == state.config.web_internal_token {
        Ok(())
    } else {
        Err(ApiError::Unauthorized)
    }
}

fn validate_address(value: String) -> Result<String, ApiError> {
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

fn validate_network(value: String) -> Result<String, ApiError> {
    let value = value.trim().to_ascii_lowercase();
    if ["testnet", "public"].contains(&value.as_str()) {
        Ok(value)
    } else {
        Err(ApiError::InvalidRequest("invalid_stellar_network"))
    }
}

fn validate_role(value: String) -> Result<String, ApiError> {
    let value = value.trim().to_ascii_lowercase();
    if ["admin", "editor", "viewer"].contains(&value.as_str()) {
        Ok(value)
    } else {
        Err(ApiError::InvalidRequest("invalid_organization_role"))
    }
}

fn map_database_error(error: sqlx::Error) -> ApiError {
    if let Some(database_error) = error.as_database_error() {
        let code = database_error.code().map(|code| code.into_owned());
        return match code.as_deref() {
            Some("23505") => ApiError::Conflict("resource_already_exists"),
            Some("23503") => ApiError::InvalidRequest("related_resource_not_found"),
            Some("23514") | Some("22P02") => ApiError::InvalidRequest("database_constraint_failed"),
            _ => {
                tracing::error!(error = %error, "access database operation failed");
                ApiError::Database
            }
        };
    }
    tracing::error!(error = %error, "access database operation failed");
    ApiError::Database
}
