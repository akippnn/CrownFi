use axum::{
    extract::{Path, State},
    http::{HeaderMap, StatusCode},
    routing::{get, post},
    Json, Router,
};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sqlx::{FromRow, PgPool, Postgres, Transaction};
use time::{format_description::well_known::Rfc3339, OffsetDateTime};
use uuid::Uuid;

use crate::{app::require_admin, error::ApiError, state::AppState};

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/platform/organizations", get(list_organizations))
        .route("/platform/organizations/:organization_id", get(get_organization))
        .route(
            "/platform/organizations/:organization_id/pageants",
            get(list_pageants),
        )
        .route(
            "/platform/pageants/:pageant_id/categories",
            get(list_categories),
        )
        .route(
            "/platform/pageants/:pageant_id/contestants",
            get(list_pageant_contestants),
        )
        .route(
            "/platform/pageant-contestants/:pageant_contestant_id/sections",
            get(list_contestant_sections),
        )
        .route("/admin/platform/bootstrap", post(bootstrap_platform))
        .route(
            "/admin/platform/organizations/:organization_id/pageants",
            post(create_pageant),
        )
        .route(
            "/admin/platform/pageants/:pageant_id/categories",
            post(create_category),
        )
        .route(
            "/admin/platform/pageants/:pageant_id/contestants",
            post(create_pageant_contestant),
        )
        .route(
            "/admin/platform/pageant-contestants/:pageant_contestant_id/sections",
            post(create_contestant_section),
        )
}

#[derive(Debug, Clone, Serialize, FromRow)]
pub struct UserRecord {
    pub id: Uuid,
    pub display_name: String,
    pub email: Option<String>,
    pub status: String,
    pub created_at: OffsetDateTime,
    pub updated_at: OffsetDateTime,
}

#[derive(Debug, Clone, Serialize, FromRow)]
pub struct OrganizationRecord {
    pub id: Uuid,
    pub name: String,
    pub slug: String,
    pub status: String,
    pub created_by_user_id: Uuid,
    pub created_at: OffsetDateTime,
    pub updated_at: OffsetDateTime,
}

#[derive(Debug, Clone, Serialize, FromRow)]
pub struct PageantRecord {
    pub id: Uuid,
    pub organization_id: Uuid,
    pub name: String,
    pub slug: String,
    pub description: Option<String>,
    pub status: String,
    pub starts_at: Option<OffsetDateTime>,
    pub ends_at: Option<OffsetDateTime>,
    pub timezone: String,
    pub venue_name: Option<String>,
    pub created_by_user_id: Uuid,
    pub created_at: OffsetDateTime,
    pub updated_at: OffsetDateTime,
}

#[derive(Debug, Clone, Serialize, FromRow)]
pub struct CategoryRecord {
    pub id: Uuid,
    pub pageant_id: Uuid,
    pub name: String,
    pub slug: String,
    pub description: Option<String>,
    pub status: String,
    pub sort_order: i32,
    pub created_at: OffsetDateTime,
    pub updated_at: OffsetDateTime,
}

#[derive(Debug, Clone, Serialize, FromRow)]
pub struct PageantContestantRecord {
    pub id: Uuid,
    pub pageant_id: Uuid,
    pub contestant_id: Uuid,
    pub display_name: String,
    pub legal_name: Option<String>,
    pub biography: Option<String>,
    pub country_code: Option<String>,
    pub sash: Option<String>,
    pub contestant_number: Option<i32>,
    pub country_representation: Option<String>,
    pub status: String,
    pub sort_order: i32,
    pub created_at: OffsetDateTime,
    pub updated_at: OffsetDateTime,
}

#[derive(Debug, Clone, Serialize, FromRow)]
pub struct ContestantSectionRecord {
    pub id: Uuid,
    pub pageant_contestant_id: Uuid,
    pub kind: String,
    pub title: String,
    pub slug: String,
    pub sort_order: i32,
    pub is_visible: bool,
    pub settings_json: Value,
    pub created_at: OffsetDateTime,
    pub updated_at: OffsetDateTime,
}

#[derive(Debug, Deserialize)]
pub struct BootstrapRequest {
    pub display_name: String,
    pub email: Option<String>,
    pub organization_name: String,
    pub organization_slug: String,
}

#[derive(Debug, Serialize)]
pub struct BootstrapResponse {
    pub user: UserRecord,
    pub organization: OrganizationRecord,
    pub membership_role: &'static str,
}

#[derive(Debug, Deserialize)]
pub struct CreatePageantRequest {
    pub name: String,
    pub slug: String,
    pub description: Option<String>,
    pub starts_at: Option<String>,
    pub ends_at: Option<String>,
    pub timezone: Option<String>,
    pub venue_name: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct CreateCategoryRequest {
    pub name: String,
    pub slug: String,
    pub description: Option<String>,
    pub sort_order: Option<i32>,
}

#[derive(Debug, Deserialize)]
pub struct CreatePageantContestantRequest {
    pub display_name: String,
    pub legal_name: Option<String>,
    pub biography: Option<String>,
    pub country_code: Option<String>,
    pub sash: Option<String>,
    pub contestant_number: Option<i32>,
    pub country_representation: Option<String>,
    pub sort_order: Option<i32>,
}

#[derive(Debug, Deserialize)]
pub struct CreateContestantSectionRequest {
    pub kind: String,
    pub title: String,
    pub slug: String,
    pub sort_order: Option<i32>,
    pub is_visible: Option<bool>,
    pub settings_json: Option<Value>,
}

async fn bootstrap_platform(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(body): Json<BootstrapRequest>,
) -> Result<(StatusCode, Json<BootstrapResponse>), ApiError> {
    require_admin(&state, &headers)?;
    let pool = database_pool(&state)?;
    let display_name = required_text(body.display_name, 160, "invalid_display_name")?;
    let organization_name = required_text(body.organization_name, 200, "invalid_organization_name")?;
    let organization_slug = required_slug(body.organization_slug)?;
    let email = optional_text(body.email, 320, "invalid_email")?;

    let user_id = Uuid::new_v4();
    let organization_id = Uuid::new_v4();
    let mut tx = pool.begin().await.map_err(map_database_error)?;

    let user = sqlx::query_as::<_, UserRecord>(
        "INSERT INTO users (id, display_name, email)\
         VALUES ($1, $2, $3)\
         RETURNING id, display_name, email, status, created_at, updated_at",
    )
    .bind(user_id)
    .bind(display_name)
    .bind(email)
    .fetch_one(&mut *tx)
    .await
    .map_err(map_database_error)?;

    let organization = sqlx::query_as::<_, OrganizationRecord>(
        "INSERT INTO organizations (id, name, slug, created_by_user_id)\
         VALUES ($1, $2, $3, $4)\
         RETURNING id, name, slug, status, created_by_user_id, created_at, updated_at",
    )
    .bind(organization_id)
    .bind(organization_name)
    .bind(organization_slug)
    .bind(user_id)
    .fetch_one(&mut *tx)
    .await
    .map_err(map_database_error)?;

    sqlx::query(
        "INSERT INTO organization_members (organization_id, user_id, role, status)\
         VALUES ($1, $2, 'owner', 'active')",
    )
    .bind(organization_id)
    .bind(user_id)
    .execute(&mut *tx)
    .await
    .map_err(map_database_error)?;

    write_audit(
        &mut tx,
        Some(organization_id),
        Some(user_id),
        "platform.bootstrap",
        "organization",
        Some(organization_id),
        serde_json::json!({"role": "owner"}),
    )
    .await?;
    tx.commit().await.map_err(map_database_error)?;

    Ok((
        StatusCode::CREATED,
        Json(BootstrapResponse {
            user,
            organization,
            membership_role: "owner",
        }),
    ))
}

async fn list_organizations(
    State(state): State<AppState>,
) -> Result<Json<Vec<OrganizationRecord>>, ApiError> {
    let pool = database_pool(&state)?;
    let organizations = sqlx::query_as::<_, OrganizationRecord>(
        "SELECT id, name, slug, status, created_by_user_id, created_at, updated_at\
         FROM organizations\
         WHERE status <> 'archived'\
         ORDER BY created_at DESC\
         LIMIT 100",
    )
    .fetch_all(pool)
    .await
    .map_err(map_database_error)?;
    Ok(Json(organizations))
}

async fn get_organization(
    State(state): State<AppState>,
    Path(organization_id): Path<Uuid>,
) -> Result<Json<OrganizationRecord>, ApiError> {
    let pool = database_pool(&state)?;
    let organization = sqlx::query_as::<_, OrganizationRecord>(
        "SELECT id, name, slug, status, created_by_user_id, created_at, updated_at\
         FROM organizations WHERE id = $1",
    )
    .bind(organization_id)
    .fetch_optional(pool)
    .await
    .map_err(map_database_error)?
    .ok_or(ApiError::NotFound)?;
    Ok(Json(organization))
}

async fn create_pageant(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(organization_id): Path<Uuid>,
    Json(body): Json<CreatePageantRequest>,
) -> Result<(StatusCode, Json<PageantRecord>), ApiError> {
    let actor_user_id = require_admin_actor(&state, &headers)?;
    let pool = database_pool(&state)?;
    require_organization_editor(pool, organization_id, actor_user_id).await?;

    let name = required_text(body.name, 200, "invalid_pageant_name")?;
    let slug = required_slug(body.slug)?;
    let description = optional_text(body.description, 20_000, "invalid_pageant_description")?;
    let starts_at = optional_timestamp(body.starts_at, "invalid_pageant_starts_at")?;
    let ends_at = optional_timestamp(body.ends_at, "invalid_pageant_ends_at")?;
    if starts_at.is_some() && ends_at.is_some() && ends_at < starts_at {
        return Err(ApiError::InvalidRequest("pageant_end_before_start"));
    }
    let timezone = optional_text(body.timezone, 120, "invalid_pageant_timezone")?
        .unwrap_or_else(|| "Asia/Manila".to_string());
    let venue_name = optional_text(body.venue_name, 300, "invalid_pageant_venue")?;

    let pageant_id = Uuid::new_v4();
    let mut tx = pool.begin().await.map_err(map_database_error)?;
    let pageant = sqlx::query_as::<_, PageantRecord>(
        "INSERT INTO pageants (\
             id, organization_id, name, slug, description, starts_at, ends_at, timezone,\
             venue_name, created_by_user_id\
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)\
         RETURNING id, organization_id, name, slug, description, status, starts_at, ends_at,\
                   timezone, venue_name, created_by_user_id, created_at, updated_at",
    )
    .bind(pageant_id)
    .bind(organization_id)
    .bind(name)
    .bind(slug)
    .bind(description)
    .bind(starts_at)
    .bind(ends_at)
    .bind(timezone)
    .bind(venue_name)
    .bind(actor_user_id)
    .fetch_one(&mut *tx)
    .await
    .map_err(map_database_error)?;

    write_audit(
        &mut tx,
        Some(organization_id),
        Some(actor_user_id),
        "pageant.create",
        "pageant",
        Some(pageant_id),
        Value::Object(Default::default()),
    )
    .await?;
    tx.commit().await.map_err(map_database_error)?;
    Ok((StatusCode::CREATED, Json(pageant)))
}

async fn list_pageants(
    State(state): State<AppState>,
    Path(organization_id): Path<Uuid>,
) -> Result<Json<Vec<PageantRecord>>, ApiError> {
    let pool = database_pool(&state)?;
    let pageants = sqlx::query_as::<_, PageantRecord>(
        "SELECT id, organization_id, name, slug, description, status, starts_at, ends_at,\
                timezone, venue_name, created_by_user_id, created_at, updated_at\
         FROM pageants\
         WHERE organization_id = $1 AND status <> 'archived'\
         ORDER BY created_at DESC",
    )
    .bind(organization_id)
    .fetch_all(pool)
    .await
    .map_err(map_database_error)?;
    Ok(Json(pageants))
}

async fn create_category(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(pageant_id): Path<Uuid>,
    Json(body): Json<CreateCategoryRequest>,
) -> Result<(StatusCode, Json<CategoryRecord>), ApiError> {
    let actor_user_id = require_admin_actor(&state, &headers)?;
    let pool = database_pool(&state)?;
    let organization_id = organization_for_pageant(pool, pageant_id).await?;
    require_organization_editor(pool, organization_id, actor_user_id).await?;

    let name = required_text(body.name, 160, "invalid_category_name")?;
    let slug = required_slug(body.slug)?;
    let description = optional_text(body.description, 10_000, "invalid_category_description")?;
    let sort_order = body.sort_order.unwrap_or(0);
    let category_id = Uuid::new_v4();
    let mut tx = pool.begin().await.map_err(map_database_error)?;

    let category = sqlx::query_as::<_, CategoryRecord>(
        "INSERT INTO categories (id, pageant_id, name, slug, description, sort_order)\
         VALUES ($1, $2, $3, $4, $5, $6)\
         RETURNING id, pageant_id, name, slug, description, status, sort_order, created_at, updated_at",
    )
    .bind(category_id)
    .bind(pageant_id)
    .bind(name)
    .bind(slug)
    .bind(description)
    .bind(sort_order)
    .fetch_one(&mut *tx)
    .await
    .map_err(map_database_error)?;

    write_audit(
        &mut tx,
        Some(organization_id),
        Some(actor_user_id),
        "category.create",
        "category",
        Some(category_id),
        serde_json::json!({"pageant_id": pageant_id}),
    )
    .await?;
    tx.commit().await.map_err(map_database_error)?;
    Ok((StatusCode::CREATED, Json(category)))
}

async fn list_categories(
    State(state): State<AppState>,
    Path(pageant_id): Path<Uuid>,
) -> Result<Json<Vec<CategoryRecord>>, ApiError> {
    let pool = database_pool(&state)?;
    let categories = sqlx::query_as::<_, CategoryRecord>(
        "SELECT id, pageant_id, name, slug, description, status, sort_order, created_at, updated_at\
         FROM categories\
         WHERE pageant_id = $1 AND status <> 'archived'\
         ORDER BY sort_order, created_at",
    )
    .bind(pageant_id)
    .fetch_all(pool)
    .await
    .map_err(map_database_error)?;
    Ok(Json(categories))
}

async fn create_pageant_contestant(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(pageant_id): Path<Uuid>,
    Json(body): Json<CreatePageantContestantRequest>,
) -> Result<(StatusCode, Json<PageantContestantRecord>), ApiError> {
    let actor_user_id = require_admin_actor(&state, &headers)?;
    let pool = database_pool(&state)?;
    let organization_id = organization_for_pageant(pool, pageant_id).await?;
    require_organization_editor(pool, organization_id, actor_user_id).await?;

    let display_name = required_text(body.display_name, 200, "invalid_contestant_name")?;
    let legal_name = optional_text(body.legal_name, 200, "invalid_contestant_legal_name")?;
    let biography = optional_text(body.biography, 20_000, "invalid_contestant_biography")?;
    let country_code = optional_country_code(body.country_code)?;
    let sash = optional_text(body.sash, 100, "invalid_contestant_sash")?;
    if body.contestant_number.is_some_and(|number| number <= 0) {
        return Err(ApiError::InvalidRequest("invalid_contestant_number"));
    }
    let country_representation = optional_text(
        body.country_representation,
        200,
        "invalid_country_representation",
    )?;
    let sort_order = body.sort_order.unwrap_or(0);

    let contestant_id = Uuid::new_v4();
    let pageant_contestant_id = Uuid::new_v4();
    let mut tx = pool.begin().await.map_err(map_database_error)?;
    sqlx::query(
        "INSERT INTO contestants (\
             id, legal_name, display_name, biography, country_code, created_by_user_id\
         ) VALUES ($1, $2, $3, $4, $5, $6)",
    )
    .bind(contestant_id)
    .bind(legal_name)
    .bind(display_name)
    .bind(biography)
    .bind(country_code)
    .bind(actor_user_id)
    .execute(&mut *tx)
    .await
    .map_err(map_database_error)?;

    sqlx::query(
        "INSERT INTO pageant_contestants (\
             id, pageant_id, contestant_id, sash, contestant_number, country_representation,\
             sort_order\
         ) VALUES ($1, $2, $3, $4, $5, $6, $7)",
    )
    .bind(pageant_contestant_id)
    .bind(pageant_id)
    .bind(contestant_id)
    .bind(sash)
    .bind(body.contestant_number)
    .bind(country_representation)
    .bind(sort_order)
    .execute(&mut *tx)
    .await
    .map_err(map_database_error)?;

    let contestant = fetch_pageant_contestant(&mut tx, pageant_contestant_id).await?;
    write_audit(
        &mut tx,
        Some(organization_id),
        Some(actor_user_id),
        "contestant.add_to_pageant",
        "pageant_contestant",
        Some(pageant_contestant_id),
        serde_json::json!({"pageant_id": pageant_id, "contestant_id": contestant_id}),
    )
    .await?;
    tx.commit().await.map_err(map_database_error)?;
    Ok((StatusCode::CREATED, Json(contestant)))
}

async fn list_pageant_contestants(
    State(state): State<AppState>,
    Path(pageant_id): Path<Uuid>,
) -> Result<Json<Vec<PageantContestantRecord>>, ApiError> {
    let pool = database_pool(&state)?;
    let contestants = sqlx::query_as::<_, PageantContestantRecord>(PAGEANT_CONTESTANT_SELECT)
        .bind(pageant_id)
        .fetch_all(pool)
        .await
        .map_err(map_database_error)?;
    Ok(Json(contestants))
}

async fn create_contestant_section(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(pageant_contestant_id): Path<Uuid>,
    Json(body): Json<CreateContestantSectionRequest>,
) -> Result<(StatusCode, Json<ContestantSectionRecord>), ApiError> {
    let actor_user_id = require_admin_actor(&state, &headers)?;
    let pool = database_pool(&state)?;
    let organization_id = organization_for_pageant_contestant(pool, pageant_contestant_id).await?;
    require_organization_editor(pool, organization_id, actor_user_id).await?;

    let kind = required_section_kind(body.kind)?;
    let title = required_text(body.title, 160, "invalid_section_title")?;
    let slug = required_slug(body.slug)?;
    let settings_json = body
        .settings_json
        .unwrap_or_else(|| Value::Object(Default::default()));
    if !settings_json.is_object() {
        return Err(ApiError::InvalidRequest("section_settings_must_be_object"));
    }

    let section_id = Uuid::new_v4();
    let mut tx = pool.begin().await.map_err(map_database_error)?;
    let section = sqlx::query_as::<_, ContestantSectionRecord>(
        "INSERT INTO contestant_sections (\
             id, pageant_contestant_id, kind, title, slug, sort_order, is_visible, settings_json\
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)\
         RETURNING id, pageant_contestant_id, kind, title, slug, sort_order, is_visible,\
                   settings_json, created_at, updated_at",
    )
    .bind(section_id)
    .bind(pageant_contestant_id)
    .bind(kind)
    .bind(title)
    .bind(slug)
    .bind(body.sort_order.unwrap_or(0))
    .bind(body.is_visible.unwrap_or(true))
    .bind(settings_json)
    .fetch_one(&mut *tx)
    .await
    .map_err(map_database_error)?;

    write_audit(
        &mut tx,
        Some(organization_id),
        Some(actor_user_id),
        "contestant_section.create",
        "contestant_section",
        Some(section_id),
        serde_json::json!({"pageant_contestant_id": pageant_contestant_id}),
    )
    .await?;
    tx.commit().await.map_err(map_database_error)?;
    Ok((StatusCode::CREATED, Json(section)))
}

async fn list_contestant_sections(
    State(state): State<AppState>,
    Path(pageant_contestant_id): Path<Uuid>,
) -> Result<Json<Vec<ContestantSectionRecord>>, ApiError> {
    let pool = database_pool(&state)?;
    let sections = sqlx::query_as::<_, ContestantSectionRecord>(
        "SELECT id, pageant_contestant_id, kind, title, slug, sort_order, is_visible,\
                settings_json, created_at, updated_at\
         FROM contestant_sections\
         WHERE pageant_contestant_id = $1\
         ORDER BY sort_order, created_at",
    )
    .bind(pageant_contestant_id)
    .fetch_all(pool)
    .await
    .map_err(map_database_error)?;
    Ok(Json(sections))
}

const PAGEANT_CONTESTANT_SELECT: &str =
    "SELECT pc.id, pc.pageant_id, pc.contestant_id, c.display_name, c.legal_name,\
            c.biography, c.country_code, pc.sash, pc.contestant_number,\
            pc.country_representation, pc.status, pc.sort_order, pc.created_at, pc.updated_at\
     FROM pageant_contestants pc\
     JOIN contestants c ON c.id = pc.contestant_id\
     WHERE pc.pageant_id = $1 AND pc.status <> 'archived'\
     ORDER BY pc.sort_order, pc.created_at";

async fn fetch_pageant_contestant(
    tx: &mut Transaction<'_, Postgres>,
    pageant_contestant_id: Uuid,
) -> Result<PageantContestantRecord, ApiError> {
    sqlx::query_as::<_, PageantContestantRecord>(
        "SELECT pc.id, pc.pageant_id, pc.contestant_id, c.display_name, c.legal_name,\
                c.biography, c.country_code, pc.sash, pc.contestant_number,\
                pc.country_representation, pc.status, pc.sort_order, pc.created_at, pc.updated_at\
         FROM pageant_contestants pc\
         JOIN contestants c ON c.id = pc.contestant_id\
         WHERE pc.id = $1",
    )
    .bind(pageant_contestant_id)
    .fetch_one(&mut **tx)
    .await
    .map_err(map_database_error)
}

fn database_pool(state: &AppState) -> Result<&PgPool, ApiError> {
    state
        .database
        .as_ref()
        .ok_or(ApiError::ServiceUnavailable("database_not_configured"))
}

fn require_admin_actor(state: &AppState, headers: &HeaderMap) -> Result<Uuid, ApiError> {
    require_admin(state, headers)?;
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
        "SELECT EXISTS (\
             SELECT 1 FROM organization_members\
             WHERE organization_id = $1 AND user_id = $2 AND status = 'active'\
               AND role IN ('owner', 'admin', 'editor')\
         )",
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

async fn organization_for_pageant(pool: &PgPool, pageant_id: Uuid) -> Result<Uuid, ApiError> {
    sqlx::query_scalar::<_, Uuid>("SELECT organization_id FROM pageants WHERE id = $1")
        .bind(pageant_id)
        .fetch_optional(pool)
        .await
        .map_err(map_database_error)?
        .ok_or(ApiError::NotFound)
}

async fn organization_for_pageant_contestant(
    pool: &PgPool,
    pageant_contestant_id: Uuid,
) -> Result<Uuid, ApiError> {
    sqlx::query_scalar::<_, Uuid>(
        "SELECT p.organization_id\
         FROM pageant_contestants pc\
         JOIN pageants p ON p.id = pc.pageant_id\
         WHERE pc.id = $1",
    )
    .bind(pageant_contestant_id)
    .fetch_optional(pool)
    .await
    .map_err(map_database_error)?
    .ok_or(ApiError::NotFound)
}

async fn write_audit(
    tx: &mut Transaction<'_, Postgres>,
    organization_id: Option<Uuid>,
    actor_user_id: Option<Uuid>,
    action: &str,
    entity_type: &str,
    entity_id: Option<Uuid>,
    metadata: Value,
) -> Result<(), ApiError> {
    sqlx::query(
        "INSERT INTO audit_logs (\
             id, organization_id, actor_user_id, action, entity_type, entity_id, metadata\
         ) VALUES ($1, $2, $3, $4, $5, $6, $7)",
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

fn required_text(
    value: String,
    max_len: usize,
    error: &'static str,
) -> Result<String, ApiError> {
    let value = value.trim().to_string();
    if value.is_empty() || value.chars().count() > max_len {
        Err(ApiError::InvalidRequest(error))
    } else {
        Ok(value)
    }
}

fn optional_text(
    value: Option<String>,
    max_len: usize,
    error: &'static str,
) -> Result<Option<String>, ApiError> {
    value
        .map(|value| required_text(value, max_len, error))
        .transpose()
}

fn required_slug(value: String) -> Result<String, ApiError> {
    let value = value.trim().to_ascii_lowercase();
    let valid = !value.is_empty()
        && value.len() <= 120
        && value
            .split('-')
            .all(|part| !part.is_empty() && part.chars().all(|character| character.is_ascii_lowercase() || character.is_ascii_digit()));
    if valid {
        Ok(value)
    } else {
        Err(ApiError::InvalidRequest("invalid_slug"))
    }
}

fn optional_timestamp(
    value: Option<String>,
    error: &'static str,
) -> Result<Option<OffsetDateTime>, ApiError> {
    value
        .map(|value| OffsetDateTime::parse(value.trim(), &Rfc3339).map_err(|_| ApiError::InvalidRequest(error)))
        .transpose()
}

fn optional_country_code(value: Option<String>) -> Result<Option<String>, ApiError> {
    value
        .map(|value| {
            let value = value.trim().to_ascii_uppercase();
            if value.len() == 2 && value.chars().all(|character| character.is_ascii_uppercase()) {
                Ok(value)
            } else {
                Err(ApiError::InvalidRequest("invalid_country_code"))
            }
        })
        .transpose()
}

fn required_section_kind(value: String) -> Result<String, ApiError> {
    const ALLOWED: &[&str] = &[
        "overview",
        "biography",
        "advocacy",
        "gallery",
        "achievements",
        "collectibles",
        "support",
        "sponsors",
        "social-links",
        "custom",
    ];
    let value = value.trim().to_ascii_lowercase();
    if ALLOWED.contains(&value.as_str()) {
        Ok(value)
    } else {
        Err(ApiError::InvalidRequest("invalid_section_kind"))
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
                tracing::error!(error = %error, "platform database operation failed");
                ApiError::Database
            }
        };
    }

    tracing::error!(error = %error, "platform database operation failed");
    ApiError::Database
}
