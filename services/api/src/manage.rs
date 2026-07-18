use axum::{
    extract::{Path, Query, State},
    http::{HeaderMap, StatusCode},
    routing::{delete, get, post},
    Json, Router,
};
use serde::{Deserialize, Serialize};
use serde_json::json;
use sqlx::{FromRow, PgPool, Postgres, Transaction};
use time::{format_description::well_known::Rfc3339, OffsetDateTime};
use uuid::Uuid;

use crate::{error::ApiError, state::AppState};

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/internal/manage/overview/:user_id", get(overview))
        .route("/internal/manage/pageants", post(create_pageant).patch(update_pageant))
        .route("/internal/manage/pageants/:id", delete(delete_pageant))
        .route("/internal/manage/categories", post(create_category))
        .route("/internal/manage/contestants", post(create_contestant).patch(update_contestant))
        .route("/internal/manage/contestants/:id", delete(delete_contestant))
        .route(
            "/internal/manage/seed-miss-stellarverse",
            post(seed_miss_stellarverse),
        )
}

#[derive(Debug, Clone, Serialize, FromRow)]
struct OrganizationSummary {
    id: Uuid,
    name: String,
    slug: String,
    status: String,
    role: String,
}

#[derive(Debug, Clone, Serialize, FromRow)]
struct PageantSummary {
    id: Uuid,
    organization_id: Uuid,
    name: String,
    slug: String,
    description: Option<String>,
    status: String,
    starts_at: Option<OffsetDateTime>,
    ends_at: Option<OffsetDateTime>,
    timezone: String,
    venue_name: Option<String>,
}

#[derive(Debug, Serialize)]
struct ManageOverview {
    is_site_admin: bool,
    organizations: Vec<OrganizationSummary>,
    pageants: Vec<PageantSummary>,
}

#[derive(Debug, Deserialize)]
struct CreatePageantRequest {
    actor_user_id: Uuid,
    organization_id: Uuid,
    name: String,
    slug: String,
    description: Option<String>,
    starts_at: Option<String>,
    ends_at: Option<String>,
    timezone: Option<String>,
    venue_name: Option<String>,
}

#[derive(Debug, Deserialize)]
struct CreateCategoryRequest {
    actor_user_id: Uuid,
    pageant_id: Uuid,
    name: String,
    slug: String,
    description: Option<String>,
    sort_order: Option<i32>,
}

#[derive(Debug, Deserialize)]
struct CreateContestantRequest {
    actor_user_id: Uuid,
    pageant_id: Uuid,
    display_name: String,
    legal_name: Option<String>,
    biography: Option<String>,
    country_code: Option<String>,
    sash: Option<String>,
    contestant_number: Option<i32>,
    country_representation: Option<String>,
    sort_order: Option<i32>,
}

#[derive(Debug, Serialize, FromRow)]
struct CategoryResponse {
    id: Uuid,
    pageant_id: Uuid,
    name: String,
    slug: String,
    description: Option<String>,
    status: String,
    sort_order: i32,
}

#[derive(Debug, Serialize, FromRow)]
struct ContestantResponse {
    id: Uuid,
    pageant_id: Uuid,
    contestant_id: Uuid,
    display_name: String,
    biography: Option<String>,
    country_code: Option<String>,
    sash: Option<String>,
    contestant_number: Option<i32>,
    country_representation: Option<String>,
    status: String,
    sort_order: i32,
}

#[derive(Debug, Deserialize)]
struct SeedRequest {
    actor_user_id: Uuid,
    organization_id: Option<Uuid>,
}

#[derive(Debug, Serialize)]
struct SeedResponse {
    pageant_id: Uuid,
    organization_id: Uuid,
    pageant_slug: &'static str,
    contestants: usize,
    ticket_fixture: &'static str,
    collectible_fixture: &'static str,
    contract_registry: &'static str,
    idempotent: bool,
}

async fn overview(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(user_id): Path<Uuid>,
) -> Result<Json<ManageOverview>, ApiError> {
    require_internal(&state, &headers)?;
    let pool = database_pool(&state)?;
    ensure_user(pool, user_id).await?;
    let is_site_admin = is_site_admin(pool, user_id).await?;

    let organizations = if is_site_admin {
        sqlx::query_as::<_, OrganizationSummary>(
            "SELECT o.id, o.name, o.slug, o.status, COALESCE(om.role, 'site-admin') AS role FROM organizations o LEFT JOIN organization_members om ON om.organization_id = o.id AND om.user_id = $1 AND om.status = 'active' WHERE o.status <> 'archived' ORDER BY o.name",
        )
        .bind(user_id)
        .fetch_all(pool)
        .await
        .map_err(map_database_error)?
    } else {
        sqlx::query_as::<_, OrganizationSummary>(
            "SELECT o.id, o.name, o.slug, o.status, om.role FROM organization_members om JOIN organizations o ON o.id = om.organization_id WHERE om.user_id = $1 AND om.status = 'active' AND om.role IN ('owner', 'admin', 'editor', 'viewer') AND o.status <> 'archived' ORDER BY o.name",
        )
        .bind(user_id)
        .fetch_all(pool)
        .await
        .map_err(map_database_error)?
    };

    let organization_ids = organizations.iter().map(|item| item.id).collect::<Vec<_>>();
    let pageants = if organization_ids.is_empty() {
        Vec::new()
    } else {
        sqlx::query_as::<_, PageantSummary>(
            "SELECT id, organization_id, name, slug, description, status, starts_at, ends_at, timezone, venue_name FROM pageants WHERE organization_id = ANY($1) AND status <> 'archived' ORDER BY created_at DESC",
        )
        .bind(&organization_ids)
        .fetch_all(pool)
        .await
        .map_err(map_database_error)?
    };

    Ok(Json(ManageOverview {
        is_site_admin,
        organizations,
        pageants,
    }))
}

async fn create_pageant(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(body): Json<CreatePageantRequest>,
) -> Result<(StatusCode, Json<PageantSummary>), ApiError> {
    require_internal(&state, &headers)?;
    let pool = database_pool(&state)?;
    require_editor(pool, body.organization_id, body.actor_user_id).await?;
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
    let pageant = sqlx::query_as::<_, PageantSummary>(
        "INSERT INTO pageants (id, organization_id, name, slug, description, starts_at, ends_at, timezone, venue_name, created_by_user_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id, organization_id, name, slug, description, status, starts_at, ends_at, timezone, venue_name",
    )
    .bind(pageant_id)
    .bind(body.organization_id)
    .bind(name)
    .bind(slug)
    .bind(description)
    .bind(starts_at)
    .bind(ends_at)
    .bind(timezone)
    .bind(venue_name)
    .bind(body.actor_user_id)
    .fetch_one(&mut *tx)
    .await
    .map_err(map_database_error)?;
    audit(
        &mut tx,
        Some(body.organization_id),
        body.actor_user_id,
        "pageant.create",
        "pageant",
        pageant_id,
        json!({}),
    )
    .await?;
    tx.commit().await.map_err(map_database_error)?;
    Ok((StatusCode::CREATED, Json(pageant)))
}

async fn create_category(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(body): Json<CreateCategoryRequest>,
) -> Result<(StatusCode, Json<CategoryResponse>), ApiError> {
    require_internal(&state, &headers)?;
    let pool = database_pool(&state)?;
    let organization_id = organization_for_pageant(pool, body.pageant_id).await?;
    require_editor(pool, organization_id, body.actor_user_id).await?;
    let category_id = Uuid::new_v4();
    let name = required_text(body.name, 160, "invalid_category_name")?;
    let slug = required_slug(body.slug)?;
    let description = optional_text(body.description, 10_000, "invalid_category_description")?;
    let mut tx = pool.begin().await.map_err(map_database_error)?;
    let category = sqlx::query_as::<_, CategoryResponse>(
        "INSERT INTO categories (id, pageant_id, name, slug, description, sort_order) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id, pageant_id, name, slug, description, status, sort_order",
    )
    .bind(category_id)
    .bind(body.pageant_id)
    .bind(name)
    .bind(slug)
    .bind(description)
    .bind(body.sort_order.unwrap_or(0))
    .fetch_one(&mut *tx)
    .await
    .map_err(map_database_error)?;
    audit(
        &mut tx,
        Some(organization_id),
        body.actor_user_id,
        "category.create",
        "category",
        category_id,
        json!({"pageant_id": body.pageant_id}),
    )
    .await?;
    tx.commit().await.map_err(map_database_error)?;
    Ok((StatusCode::CREATED, Json(category)))
}

async fn create_contestant(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(body): Json<CreateContestantRequest>,
) -> Result<(StatusCode, Json<ContestantResponse>), ApiError> {
    require_internal(&state, &headers)?;
    let pool = database_pool(&state)?;
    let organization_id = organization_for_pageant(pool, body.pageant_id).await?;
    require_editor(pool, organization_id, body.actor_user_id).await?;
    let display_name = required_text(body.display_name, 200, "invalid_contestant_name")?;
    let legal_name = optional_text(body.legal_name, 200, "invalid_contestant_legal_name")?;
    let biography = optional_text(body.biography, 20_000, "invalid_contestant_biography")?;
    let country_code = optional_country_code(body.country_code)?;
    let sash = optional_text(body.sash, 100, "invalid_contestant_sash")?;
    let country_representation = optional_text(
        body.country_representation,
        200,
        "invalid_country_representation",
    )?;
    if body.contestant_number.is_some_and(|number| number <= 0) {
        return Err(ApiError::InvalidRequest("invalid_contestant_number"));
    }
    let contestant_id = Uuid::new_v4();
    let pageant_contestant_id = Uuid::new_v4();
    let mut tx = pool.begin().await.map_err(map_database_error)?;
    sqlx::query(
        "INSERT INTO contestants (id, legal_name, display_name, biography, country_code, created_by_user_id) VALUES ($1,$2,$3,$4,$5,$6)",
    )
    .bind(contestant_id)
    .bind(legal_name)
    .bind(display_name)
    .bind(biography)
    .bind(country_code)
    .bind(body.actor_user_id)
    .execute(&mut *tx)
    .await
    .map_err(map_database_error)?;
    let contestant = sqlx::query_as::<_, ContestantResponse>(
        "WITH inserted AS (INSERT INTO pageant_contestants (id, pageant_id, contestant_id, sash, contestant_number, country_representation, sort_order) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id, pageant_id, contestant_id, sash, contestant_number, country_representation, status, sort_order) SELECT i.id, i.pageant_id, i.contestant_id, c.display_name, c.biography, c.country_code, i.sash, i.contestant_number, i.country_representation, i.status, i.sort_order FROM inserted i JOIN contestants c ON c.id = i.contestant_id",
    )
    .bind(pageant_contestant_id)
    .bind(body.pageant_id)
    .bind(contestant_id)
    .bind(sash)
    .bind(body.contestant_number)
    .bind(country_representation)
    .bind(body.sort_order.unwrap_or(0))
    .fetch_one(&mut *tx)
    .await
    .map_err(map_database_error)?;
    audit(
        &mut tx,
        Some(organization_id),
        body.actor_user_id,
        "contestant.add_to_pageant",
        "pageant_contestant",
        pageant_contestant_id,
        json!({"pageant_id": body.pageant_id, "contestant_id": contestant_id}),
    )
    .await?;
    tx.commit().await.map_err(map_database_error)?;
    Ok((StatusCode::CREATED, Json(contestant)))
}

async fn seed_miss_stellarverse(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(body): Json<SeedRequest>,
) -> Result<Json<SeedResponse>, ApiError> {
    require_internal(&state, &headers)?;
    let pool = database_pool(&state)?;
    let organization_id = match body.organization_id {
        Some(id) => {
            require_editor(pool, id, body.actor_user_id).await?;
            id
        }
        None => first_editable_organization(pool, body.actor_user_id).await?,
    };

    let pageant_id = uuid("c10f1700-0000-4000-8000-000000000001")?;
    let category_id = uuid("c10f1700-0000-4000-8000-000000000002")?;
    let ticket_id = uuid("c10f1700-0000-4000-8000-000000000020")?;
    let ticket_price_id = uuid("c10f1700-0000-4000-8000-000000000021")?;
    let collectible_id = uuid("c10f1700-0000-4000-8000-000000000030")?;
    let collectible_price_id = uuid("c10f1700-0000-4000-8000-000000000031")?;
    let collection_id = uuid("c10f1700-0000-4000-8000-000000000032")?;
    let edition_id = uuid("c10f1700-0000-4000-8000-000000000033")?;
    let contestants = [
        (
            "c10f1700-0000-4000-8000-000000000101",
            "c10f1700-0000-4000-8000-000000000201",
            "Amara Reyes",
            "PH",
            "Philippines",
            1,
        ),
        (
            "c10f1700-0000-4000-8000-000000000102",
            "c10f1700-0000-4000-8000-000000000202",
            "Hana Sato",
            "JP",
            "Japan",
            2,
        ),
        (
            "c10f1700-0000-4000-8000-000000000103",
            "c10f1700-0000-4000-8000-000000000203",
            "Linh Nguyen",
            "VN",
            "Vietnam",
            3,
        ),
        (
            "c10f1700-0000-4000-8000-000000000104",
            "c10f1700-0000-4000-8000-000000000204",
            "Mei Chen",
            "CN",
            "China",
            4,
        ),
        (
            "c10f1700-0000-4000-8000-000000000105",
            "c10f1700-0000-4000-8000-000000000205",
            "Aisha Rahman",
            "SG",
            "Singapore",
            5,
        ),
    ];

    let mut tx = pool.begin().await.map_err(map_database_error)?;
    sqlx::query(
        "INSERT INTO pageants (id, organization_id, name, slug, description, status, timezone, venue_name, created_by_user_id) VALUES ($1,$2,'Miss Stellarverse','miss-stellarverse','Deterministic CrownFi reference pageant for browser and Testnet acceptance.','published','Asia/Manila','Stellarverse Grand Hall',$3) ON CONFLICT (organization_id, slug) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description, venue_name = EXCLUDED.venue_name, updated_at = now()",
    )
    .bind(pageant_id)
    .bind(organization_id)
    .bind(body.actor_user_id)
    .execute(&mut *tx)
    .await
    .map_err(map_database_error)?;
    let actual_pageant_id = sqlx::query_scalar::<_, Uuid>(
        "SELECT id FROM pageants WHERE organization_id = $1 AND slug = 'miss-stellarverse'",
    )
    .bind(organization_id)
    .fetch_one(&mut *tx)
    .await
    .map_err(map_database_error)?;

    sqlx::query(
        "INSERT INTO categories (id, pageant_id, name, slug, description, status, sort_order) VALUES ($1,$2,'People''s Choice','peoples-choice','Reference voting category.','draft',0) ON CONFLICT (pageant_id, slug) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description, updated_at = now()",
    )
    .bind(category_id)
    .bind(actual_pageant_id)
    .execute(&mut *tx)
    .await
    .map_err(map_database_error)?;

    for (contestant_raw, participation_raw, name, country, representation, number) in contestants {
        let contestant_id = uuid(contestant_raw)?;
        let participation_id = uuid(participation_raw)?;
        sqlx::query(
            "INSERT INTO contestants (id, display_name, biography, country_code, created_by_user_id) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (id) DO UPDATE SET display_name = EXCLUDED.display_name, biography = EXCLUDED.biography, country_code = EXCLUDED.country_code, updated_at = now()",
        )
        .bind(contestant_id)
        .bind(name)
        .bind(format!("{name} is a Miss Stellarverse reference contestant."))
        .bind(country)
        .bind(body.actor_user_id)
        .execute(&mut *tx)
        .await
        .map_err(map_database_error)?;
        sqlx::query(
            "INSERT INTO pageant_contestants (id, pageant_id, contestant_id, sash, contestant_number, country_representation, status, sort_order) VALUES ($1,$2,$3,$4,$5,$6,'active',$5) ON CONFLICT (pageant_id, contestant_id) DO UPDATE SET sash = EXCLUDED.sash, contestant_number = EXCLUDED.contestant_number, country_representation = EXCLUDED.country_representation, status = 'active', sort_order = EXCLUDED.sort_order, updated_at = now()",
        )
        .bind(participation_id)
        .bind(actual_pageant_id)
        .bind(contestant_id)
        .bind(country)
        .bind(number)
        .bind(representation)
        .execute(&mut *tx)
        .await
        .map_err(map_database_error)?;
    }

    upsert_product(
        &mut tx,
        ticket_id,
        ticket_price_id,
        organization_id,
        actual_pageant_id,
        body.actor_user_id,
        "ticket",
        "Miss Stellarverse General Admission",
        "miss-stellarverse-general-admission",
        50_000_000,
        100,
    )
    .await?;
    upsert_product(
        &mut tx,
        collectible_id,
        collectible_price_id,
        organization_id,
        actual_pageant_id,
        body.actor_user_id,
        "collectible",
        "Miss Stellarverse Reference Collectible",
        "miss-stellarverse-reference-collectible",
        25_000_000,
        5,
    )
    .await?;
    sqlx::query(
        "INSERT INTO collectible_collections (id, organization_id, pageant_id, name, slug, description, status, contract_id, created_by_user_id) VALUES ($1,$2,$3,'Miss Stellarverse Reference Collection','miss-stellarverse-reference-collection','Fixture definition only; not deployed or minted.','draft',NULL,$4) ON CONFLICT (organization_id, slug) DO UPDATE SET description = EXCLUDED.description, contract_id = NULL, updated_at = now()",
    )
    .bind(collection_id)
    .bind(organization_id)
    .bind(actual_pageant_id)
    .bind(body.actor_user_id)
    .execute(&mut *tx)
    .await
    .map_err(map_database_error)?;
    let actual_collection_id = sqlx::query_scalar::<_, Uuid>(
        "SELECT id FROM collectible_collections WHERE organization_id = $1 AND slug = 'miss-stellarverse-reference-collection'",
    )
    .bind(organization_id)
    .fetch_one(&mut *tx)
    .await
    .map_err(map_database_error)?;
    sqlx::query(
        "INSERT INTO collectible_editions (id, collection_id, product_id, edition_number, supply_limit, mint_policy, contract_id) VALUES ($1,$2,$3,1,5,'on_purchase',NULL) ON CONFLICT (product_id) DO UPDATE SET collection_id = EXCLUDED.collection_id, supply_limit = EXCLUDED.supply_limit, contract_id = NULL, updated_at = now()",
    )
    .bind(edition_id)
    .bind(actual_collection_id)
    .bind(collectible_id)
    .execute(&mut *tx)
    .await
    .map_err(map_database_error)?;

    audit(
        &mut tx,
        Some(organization_id),
        body.actor_user_id,
        "reference_seed.miss_stellarverse",
        "pageant",
        actual_pageant_id,
        json!({"fixture_only": true, "contracts": "not_registered"}),
    )
    .await?;
    tx.commit().await.map_err(map_database_error)?;

    Ok(Json(SeedResponse {
        pageant_id: actual_pageant_id,
        organization_id,
        pageant_slug: "miss-stellarverse",
        contestants: 5,
        ticket_fixture: "draft",
        collectible_fixture: "definition-only-not-minted",
        contract_registry: "not-registered",
        idempotent: true,
    }))
}

async fn upsert_product(
    tx: &mut Transaction<'_, Postgres>,
    product_id: Uuid,
    price_id: Uuid,
    organization_id: Uuid,
    pageant_id: Uuid,
    actor_user_id: Uuid,
    kind: &str,
    name: &str,
    slug: &str,
    amount_minor: i64,
    supply_limit: i64,
) -> Result<(), ApiError> {
    sqlx::query(
        "INSERT INTO products (id, organization_id, pageant_id, kind, name, slug, description, status, created_by_user_id) VALUES ($1,$2,$3,$4,$5,$6,'Reference fixture; not a completed on-chain asset.','draft',$7) ON CONFLICT (organization_id, slug) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description, status = 'draft', updated_at = now()",
    )
    .bind(product_id)
    .bind(organization_id)
    .bind(pageant_id)
    .bind(kind)
    .bind(name)
    .bind(slug)
    .bind(actor_user_id)
    .execute(&mut **tx)
    .await
    .map_err(map_database_error)?;
    let actual_product_id = sqlx::query_scalar::<_, Uuid>(
        "SELECT id FROM products WHERE organization_id = $1 AND slug = $2",
    )
    .bind(organization_id)
    .bind(slug)
    .fetch_one(&mut **tx)
    .await
    .map_err(map_database_error)?;
    sqlx::query(
        "INSERT INTO product_prices (id, product_id, amount_minor, asset_code, asset_scale, asset_issuer, is_active) VALUES ($1,$2,$3,'XLM',7,NULL,true) ON CONFLICT (product_id, asset_code, COALESCE(asset_issuer, '')) WHERE is_active DO UPDATE SET amount_minor = EXCLUDED.amount_minor",
    )
    .bind(price_id)
    .bind(actual_product_id)
    .bind(amount_minor)
    .execute(&mut **tx)
    .await
    .map_err(map_database_error)?;
    sqlx::query(
        "INSERT INTO product_inventory (product_id, supply_limit) VALUES ($1,$2) ON CONFLICT (product_id) DO UPDATE SET supply_limit = GREATEST(EXCLUDED.supply_limit, product_inventory.reserved_quantity + product_inventory.fulfilled_quantity), updated_at = now()",
    )
    .bind(actual_product_id)
    .bind(supply_limit)
    .execute(&mut **tx)
    .await
    .map_err(map_database_error)?;
    Ok(())
}

async fn first_editable_organization(pool: &PgPool, user_id: Uuid) -> Result<Uuid, ApiError> {
    if is_site_admin(pool, user_id).await? {
        return sqlx::query_scalar::<_, Uuid>(
            "SELECT id FROM organizations WHERE status <> 'archived' ORDER BY created_at LIMIT 1",
        )
        .fetch_optional(pool)
        .await
        .map_err(map_database_error)?
        .ok_or(ApiError::NotFound);
    }
    sqlx::query_scalar::<_, Uuid>(
        "SELECT organization_id FROM organization_members WHERE user_id = $1 AND status = 'active' AND role IN ('owner','admin','editor') ORDER BY created_at LIMIT 1",
    )
    .bind(user_id)
    .fetch_optional(pool)
    .await
    .map_err(map_database_error)?
    .ok_or(ApiError::Forbidden)
}

async fn require_editor(
    pool: &PgPool,
    organization_id: Uuid,
    user_id: Uuid,
) -> Result<(), ApiError> {
    let allowed = is_site_admin(pool, user_id).await?
        || sqlx::query_scalar::<_, bool>(
            "SELECT EXISTS (SELECT 1 FROM organization_members WHERE organization_id = $1 AND user_id = $2 AND status = 'active' AND role IN ('owner','admin','editor'))",
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

async fn is_site_admin(pool: &PgPool, user_id: Uuid) -> Result<bool, ApiError> {
    sqlx::query_scalar::<_, bool>(
        "SELECT EXISTS (SELECT 1 FROM site_administrators WHERE user_id = $1 AND status = 'active')",
    )
    .bind(user_id)
    .fetch_one(pool)
    .await
    .map_err(map_database_error)
}

async fn ensure_user(pool: &PgPool, user_id: Uuid) -> Result<(), ApiError> {
    let exists = sqlx::query_scalar::<_, bool>("SELECT EXISTS (SELECT 1 FROM users WHERE id = $1)")
        .bind(user_id)
        .fetch_one(pool)
        .await
        .map_err(map_database_error)?;
    if exists {
        Ok(())
    } else {
        Err(ApiError::NotFound)
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

async fn audit(
    tx: &mut Transaction<'_, Postgres>,
    organization_id: Option<Uuid>,
    actor_user_id: Uuid,
    action: &str,
    entity_type: &str,
    entity_id: Uuid,
    metadata: serde_json::Value,
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

fn required_text(value: String, max_len: usize, error: &'static str) -> Result<String, ApiError> {
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
        && value.split('-').all(|part| {
            !part.is_empty()
                && part
                    .chars()
                    .all(|character| character.is_ascii_lowercase() || character.is_ascii_digit())
        });
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
        .map(|value| {
            OffsetDateTime::parse(value.trim(), &Rfc3339)
                .map_err(|_| ApiError::InvalidRequest(error))
        })
        .transpose()
}

fn optional_country_code(value: Option<String>) -> Result<Option<String>, ApiError> {
    value
        .map(|value| {
            let value = value.trim().to_ascii_uppercase();
            if value.len() == 2
                && value
                    .chars()
                    .all(|character| character.is_ascii_uppercase())
            {
                Ok(value)
            } else {
                Err(ApiError::InvalidRequest("invalid_country_code"))
            }
        })
        .transpose()
}

fn uuid(value: &str) -> Result<Uuid, ApiError> {
    Uuid::parse_str(value).map_err(|_| ApiError::Database)
}

fn map_database_error(error: sqlx::Error) -> ApiError {
    if let Some(database_error) = error.as_database_error() {
        let code = database_error.code().map(|code| code.into_owned());
        return match code.as_deref() {
            Some("23505") => ApiError::Conflict("resource_already_exists"),
            Some("23503") => ApiError::InvalidRequest("related_resource_not_found"),
            Some("23514") | Some("22P02") => ApiError::InvalidRequest("database_constraint_failed"),
            _ => {
                tracing::error!(error = %error, "manage database operation failed");
                ApiError::Database
            }
        };
    }
    tracing::error!(error = %error, "manage database operation failed");
    ApiError::Database
}

#[derive(Debug, Deserialize)]
struct UpdatePageantRequest {
    actor_user_id: Uuid,
    pageant_id: Uuid,
    name: Option<String>,
    slug: Option<String>,
    description: Option<String>,
    starts_at: Option<String>,
    ends_at: Option<String>,
    timezone: Option<String>,
    venue_name: Option<String>,
    status: Option<String>,
}

#[derive(Debug, Deserialize)]
struct UpdateContestantRequest {
    actor_user_id: Uuid,
    pageant_contestant_id: Uuid,
    display_name: Option<String>,
    legal_name: Option<String>,
    biography: Option<String>,
    country_code: Option<String>,
    sash: Option<String>,
    contestant_number: Option<i32>,
    country_representation: Option<String>,
    sort_order: Option<i32>,
}

#[derive(Debug, Deserialize)]
struct DeleteParams {
    actor_user_id: Uuid,
}

async fn update_pageant(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(body): Json<UpdatePageantRequest>,
) -> Result<Json<PageantSummary>, ApiError> {
    require_internal(&state, &headers)?;
    let pool = database_pool(&state)?;
    let organization_id = organization_for_pageant(pool, body.pageant_id).await?;
    require_editor(pool, organization_id, body.actor_user_id).await?;

    let name = match body.name {
        Some(val) => Some(required_text(val, 200, "invalid_pageant_name")?),
        None => None,
    };
    let slug = match body.slug {
        Some(val) => Some(required_slug(val)?),
        None => None,
    };
    let description = match body.description {
        Some(val) => Some(optional_text(Some(val), 20_000, "invalid_pageant_description")?),
        None => None,
    };
    let starts_at = match body.starts_at {
        Some(val) => Some(optional_timestamp(Some(val), "invalid_pageant_starts_at")?),
        None => None,
    };
    let ends_at = match body.ends_at {
        Some(val) => Some(optional_timestamp(Some(val), "invalid_pageant_ends_at")?),
        None => None,
    };
    if let (Some(Some(start)), Some(Some(end))) = (&starts_at, &ends_at) {
        if end < start {
            return Err(ApiError::InvalidRequest("pageant_end_before_start"));
        }
    }
    let timezone = match body.timezone {
        Some(val) => Some(required_text(val, 120, "invalid_pageant_timezone")?),
        None => None,
    };
    let venue_name = match body.venue_name {
        Some(val) => Some(optional_text(Some(val), 300, "invalid_pageant_venue")?),
        None => None,
    };
    let status = match body.status {
        Some(val) => Some(required_text(val, 50, "invalid_pageant_status")?),
        None => None,
    };

    let mut tx = pool.begin().await.map_err(map_database_error)?;
    
    // Check starts_at / ends_at constraints with existing values if one is omitted
    if starts_at.is_some() || ends_at.is_some() {
        let existing: (Option<OffsetDateTime>, Option<OffsetDateTime>) = sqlx::query_as(
            "SELECT starts_at, ends_at FROM pageants WHERE id = $1"
        )
        .bind(body.pageant_id)
        .fetch_one(&mut *tx)
        .await
        .map_err(map_database_error)?;
        let check_start = starts_at.clone().flatten().or(existing.0);
        let check_end = ends_at.clone().flatten().or(existing.1);
        if let (Some(start), Some(end)) = (check_start, check_end) {
            if end < start {
                return Err(ApiError::InvalidRequest("pageant_end_before_start"));
            }
        }
    }

    let pageant = sqlx::query_as::<_, PageantSummary>(
        "UPDATE pageants SET
            name = COALESCE($2, name),
            slug = COALESCE($3, slug),
            description = COALESCE($4, description),
            starts_at = CASE WHEN $5 = TRUE THEN $6 ELSE starts_at END,
            ends_at = CASE WHEN $7 = TRUE THEN $8 ELSE ends_at END,
            timezone = COALESCE($9, timezone),
            venue_name = CASE WHEN $10 = TRUE THEN $11 ELSE venue_name END,
            status = COALESCE($12, status),
            updated_at = now()
        WHERE id = $1
        RETURNING id, organization_id, name, slug, description, status, starts_at, ends_at, timezone, venue_name",
    )
    .bind(body.pageant_id)
    .bind(name)
    .bind(slug)
    .bind(description)
    .bind(starts_at.is_some())
    .bind(starts_at.flatten())
    .bind(ends_at.is_some())
    .bind(ends_at.flatten())
    .bind(timezone)
    .bind(venue_name.is_some())
    .bind(venue_name.flatten())
    .bind(status)
    .fetch_one(&mut *tx)
    .await
    .map_err(map_database_error)?;

    audit(
        &mut tx,
        Some(organization_id),
        body.actor_user_id,
        "pageant.update",
        "pageant",
        body.pageant_id,
        json!({"name": pageant.name}),
    )
    .await?;
    tx.commit().await.map_err(map_database_error)?;
    Ok(Json(pageant))
}

async fn delete_pageant(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(pageant_id): Path<Uuid>,
    Query(params): Query<DeleteParams>,
) -> Result<StatusCode, ApiError> {
    require_internal(&state, &headers)?;
    let pool = database_pool(&state)?;
    let organization_id = organization_for_pageant(pool, pageant_id).await?;
    require_editor(pool, organization_id, params.actor_user_id).await?;

    let mut tx = pool.begin().await.map_err(map_database_error)?;
    sqlx::query(
        "UPDATE pageants SET status = 'archived', updated_at = now() WHERE id = $1",
    )
    .bind(pageant_id)
    .execute(&mut *tx)
    .await
    .map_err(map_database_error)?;

    audit(
        &mut tx,
        Some(organization_id),
        params.actor_user_id,
        "pageant.delete",
        "pageant",
        pageant_id,
        json!({}),
    )
    .await?;
    tx.commit().await.map_err(map_database_error)?;
    Ok(StatusCode::NO_CONTENT)
}

async fn update_contestant(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(body): Json<UpdateContestantRequest>,
) -> Result<Json<ContestantResponse>, ApiError> {
    require_internal(&state, &headers)?;
    let pool = database_pool(&state)?;

    let pc: (Uuid, Uuid) = sqlx::query_as(
        "SELECT pageant_id, contestant_id FROM pageant_contestants WHERE id = $1"
    )
    .bind(body.pageant_contestant_id)
    .fetch_optional(pool)
    .await
    .map_err(map_database_error)?
    .ok_or(ApiError::NotFound)?;

    let organization_id = organization_for_pageant(pool, pc.0).await?;
    require_editor(pool, organization_id, body.actor_user_id).await?;

    let display_name = match body.display_name {
        Some(val) => Some(required_text(val, 200, "invalid_contestant_name")?),
        None => None,
    };
    let legal_name = match body.legal_name {
        Some(val) => Some(optional_text(Some(val), 200, "invalid_contestant_legal_name")?),
        None => None,
    };
    let biography = match body.biography {
        Some(val) => Some(optional_text(Some(val), 20_000, "invalid_contestant_biography")?),
        None => None,
    };
    let country_code = match body.country_code {
        Some(val) => Some(optional_country_code(Some(val))?),
        None => None,
    };
    let sash = match body.sash {
        Some(val) => Some(optional_text(Some(val), 100, "invalid_contestant_sash")?),
        None => None,
    };
    let country_representation = match body.country_representation {
        Some(val) => Some(optional_text(Some(val), 200, "invalid_country_representation")?),
        None => None,
    };
    if let Some(number) = body.contestant_number {
        if number <= 0 {
            return Err(ApiError::InvalidRequest("invalid_contestant_number"));
        }
    }

    let mut tx = pool.begin().await.map_err(map_database_error)?;

    sqlx::query(
        "UPDATE contestants SET
            display_name = COALESCE($2, display_name),
            legal_name = CASE WHEN $3 = TRUE THEN $4 ELSE legal_name END,
            biography = CASE WHEN $5 = TRUE THEN $6 ELSE biography END,
            country_code = COALESCE($7, country_code),
            updated_at = now()
        WHERE id = $1",
    )
    .bind(pc.1)
    .bind(display_name)
    .bind(legal_name.is_some())
    .bind(legal_name.flatten())
    .bind(biography.is_some())
    .bind(biography.flatten())
    .bind(country_code)
    .execute(&mut *tx)
    .await
    .map_err(map_database_error)?;

    sqlx::query(
        "UPDATE pageant_contestants SET
            sash = COALESCE($2, sash),
            contestant_number = CASE WHEN $3 = TRUE THEN $4 ELSE contestant_number END,
            country_representation = COALESCE($5, country_representation),
            sort_order = COALESCE($6, sort_order),
            updated_at = now()
        WHERE id = $1",
    )
    .bind(body.pageant_contestant_id)
    .bind(sash)
    .bind(body.contestant_number.is_some())
    .bind(body.contestant_number)
    .bind(country_representation)
    .bind(body.sort_order)
    .execute(&mut *tx)
    .await
    .map_err(map_database_error)?;

    let contestant = sqlx::query_as::<_, ContestantResponse>(
        "SELECT pc.id, pc.pageant_id, pc.contestant_id, c.display_name, c.biography, c.country_code, pc.sash, pc.contestant_number, pc.country_representation, pc.status, pc.sort_order FROM pageant_contestants pc JOIN contestants c ON c.id = pc.contestant_id WHERE pc.id = $1",
    )
    .bind(body.pageant_contestant_id)
    .fetch_one(&mut *tx)
    .await
    .map_err(map_database_error)?;

    audit(
        &mut tx,
        Some(organization_id),
        body.actor_user_id,
        "contestant.update",
        "pageant_contestant",
        body.pageant_contestant_id,
        json!({"pageant_id": pc.0, "contestant_id": pc.1}),
    )
    .await?;
    tx.commit().await.map_err(map_database_error)?;
    Ok(Json(contestant))
}

async fn delete_contestant(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(pageant_contestant_id): Path<Uuid>,
    Query(params): Query<DeleteParams>,
) -> Result<StatusCode, ApiError> {
    require_internal(&state, &headers)?;
    let pool = database_pool(&state)?;

    let pc: (Uuid, Uuid) = sqlx::query_as(
        "SELECT pageant_id, contestant_id FROM pageant_contestants WHERE id = $1"
    )
    .bind(pageant_contestant_id)
    .fetch_optional(pool)
    .await
    .map_err(map_database_error)?
    .ok_or(ApiError::NotFound)?;

    let organization_id = organization_for_pageant(pool, pc.0).await?;
    require_editor(pool, organization_id, params.actor_user_id).await?;

    let mut tx = pool.begin().await.map_err(map_database_error)?;

    sqlx::query(
        "DELETE FROM pageant_contestants WHERE id = $1",
    )
    .bind(pageant_contestant_id)
    .execute(&mut *tx)
    .await
    .map_err(map_database_error)?;

    let count = sqlx::query_scalar::<_, i64>(
        "SELECT COUNT(*) FROM pageant_contestants WHERE contestant_id = $1",
    )
    .bind(pc.1)
    .fetch_one(&mut *tx)
    .await
    .map_err(map_database_error)?;

    if count == 0 {
        sqlx::query(
            "DELETE FROM contestants WHERE id = $1",
        )
        .bind(pc.1)
        .execute(&mut *tx)
        .await
        .map_err(map_database_error)?;
    }

    audit(
        &mut tx,
        Some(organization_id),
        params.actor_user_id,
        "contestant.delete",
        "pageant_contestant",
        pageant_contestant_id,
        json!({"pageant_id": pc.0, "contestant_id": pc.1}),
    )
    .await?;
    tx.commit().await.map_err(map_database_error)?;
    Ok(StatusCode::NO_CONTENT)
}
