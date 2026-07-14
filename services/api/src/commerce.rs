use axum::{
    extract::{Path, State},
    http::{HeaderMap, StatusCode},
    routing::{get, post},
    Json, Router,
};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sqlx::{FromRow, PgPool, Postgres, Transaction};
use time::OffsetDateTime;
use uuid::Uuid;

use crate::{app::require_admin, error::ApiError, state::AppState};

pub fn router() -> Router<AppState> {
    Router::new()
        .route(
            "/platform/organizations/:organization_id/products",
            get(list_products),
        )
        .route("/platform/products/:product_id", get(get_product))
        .route(
            "/platform/organizations/:organization_id/collectible-collections",
            get(list_collectible_collections),
        )
        .route(
            "/platform/collectible-collections/:collection_id/editions",
            get(list_collectible_editions),
        )
        .route(
            "/admin/platform/organizations/:organization_id/products",
            post(create_product),
        )
        .route(
            "/admin/platform/organizations/:organization_id/collectible-collections",
            post(create_collectible_collection),
        )
        .route(
            "/admin/platform/collectible-collections/:collection_id/editions",
            post(create_collectible_edition),
        )
}

#[derive(Debug, Clone, Serialize, FromRow)]
pub struct ProductRecord {
    pub id: Uuid,
    pub organization_id: Uuid,
    pub pageant_id: Option<Uuid>,
    pub pageant_contestant_id: Option<Uuid>,
    pub kind: String,
    pub name: String,
    pub slug: String,
    pub description: Option<String>,
    pub status: String,
    pub created_by_user_id: Uuid,
    pub created_at: OffsetDateTime,
    pub updated_at: OffsetDateTime,
}

#[derive(Debug, Clone, Serialize, FromRow)]
pub struct ProductPriceRecord {
    pub id: Uuid,
    pub product_id: Uuid,
    pub amount_minor: i64,
    pub asset_code: String,
    pub asset_scale: i16,
    pub asset_issuer: Option<String>,
    pub is_active: bool,
    pub starts_at: Option<OffsetDateTime>,
    pub ends_at: Option<OffsetDateTime>,
    pub created_at: OffsetDateTime,
}

#[derive(Debug, Clone, Serialize, FromRow)]
pub struct ProductInventoryRecord {
    pub product_id: Uuid,
    pub supply_limit: Option<i64>,
    pub reserved_quantity: i64,
    pub fulfilled_quantity: i64,
    pub updated_at: OffsetDateTime,
}

#[derive(Debug, Clone, Serialize, FromRow)]
pub struct ProductMediaRecord {
    pub id: Uuid,
    pub product_id: Uuid,
    pub media_asset_id: Uuid,
    pub role: String,
    pub sort_order: i32,
    pub created_at: OffsetDateTime,
}

#[derive(Debug, Clone, Serialize)]
pub struct ProductDetailResponse {
    pub product: ProductRecord,
    pub prices: Vec<ProductPriceRecord>,
    pub inventory: ProductInventoryRecord,
    pub media: Vec<ProductMediaRecord>,
}

#[derive(Debug, Clone, Serialize, FromRow)]
pub struct CollectibleCollectionRecord {
    pub id: Uuid,
    pub organization_id: Uuid,
    pub pageant_id: Option<Uuid>,
    pub pageant_contestant_id: Option<Uuid>,
    pub name: String,
    pub slug: String,
    pub description: Option<String>,
    pub status: String,
    pub contract_id: Option<String>,
    pub metadata_sha256: Option<String>,
    pub created_by_user_id: Uuid,
    pub created_at: OffsetDateTime,
    pub updated_at: OffsetDateTime,
}

#[derive(Debug, Clone, Serialize, FromRow)]
pub struct CollectibleEditionRecord {
    pub id: Uuid,
    pub collection_id: Uuid,
    pub product_id: Uuid,
    pub edition_number: i32,
    pub supply_limit: i64,
    pub mint_policy: String,
    pub contract_id: Option<String>,
    pub metadata_sha256: Option<String>,
    pub artwork_media_asset_id: Option<Uuid>,
    pub created_at: OffsetDateTime,
    pub updated_at: OffsetDateTime,
}

#[derive(Debug, Deserialize)]
pub struct CreateProductRequest {
    pub kind: String,
    pub name: String,
    pub slug: String,
    pub description: Option<String>,
    pub status: Option<String>,
    pub pageant_id: Option<Uuid>,
    pub pageant_contestant_id: Option<Uuid>,
    pub amount_minor: i64,
    pub asset_code: String,
    pub asset_scale: i16,
    pub asset_issuer: Option<String>,
    pub supply_limit: Option<i64>,
    pub primary_media_asset_id: Option<Uuid>,
}

#[derive(Debug, Deserialize)]
pub struct CreateCollectibleCollectionRequest {
    pub name: String,
    pub slug: String,
    pub description: Option<String>,
    pub status: Option<String>,
    pub pageant_id: Option<Uuid>,
    pub pageant_contestant_id: Option<Uuid>,
    pub contract_id: Option<String>,
    pub metadata_sha256: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct CreateCollectibleEditionRequest {
    pub product_id: Uuid,
    pub edition_number: i32,
    pub supply_limit: i64,
    pub mint_policy: Option<String>,
    pub contract_id: Option<String>,
    pub metadata_sha256: Option<String>,
    pub artwork_media_asset_id: Option<Uuid>,
}

async fn create_product(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(organization_id): Path<Uuid>,
    Json(body): Json<CreateProductRequest>,
) -> Result<(StatusCode, Json<ProductDetailResponse>), ApiError> {
    let actor_user_id = require_admin_actor(&state, &headers)?;
    let pool = database_pool(&state)?;
    require_organization_editor(pool, organization_id, actor_user_id).await?;

    let kind = validate_product_kind(body.kind)?;
    let name = required_text(body.name, 200, "invalid_product_name")?;
    let slug = required_slug(body.slug)?;
    let description = optional_text(body.description, 20_000, "invalid_product_description")?;
    let status = validate_publication_status(body.status)?;
    let pageant_id = validate_catalogue_scope(
        pool,
        organization_id,
        body.pageant_id,
        body.pageant_contestant_id,
    )
    .await?;
    let (asset_code, asset_issuer) = validate_stellar_asset(body.asset_code, body.asset_issuer)?;
    if body.amount_minor <= 0 {
        return Err(ApiError::InvalidRequest("invalid_amount_minor"));
    }
    if !(0..=7).contains(&body.asset_scale) {
        return Err(ApiError::InvalidRequest("invalid_asset_scale"));
    }
    if body.supply_limit.is_some_and(|limit| limit <= 0) {
        return Err(ApiError::InvalidRequest("invalid_supply_limit"));
    }
    if let Some(media_asset_id) = body.primary_media_asset_id {
        require_public_media(pool, organization_id, media_asset_id).await?;
    }

    let product_id = Uuid::new_v4();
    let price_id = Uuid::new_v4();
    let mut tx = pool.begin().await.map_err(map_database_error)?;

    sqlx::query(
        "INSERT INTO products (id, organization_id, pageant_id, pageant_contestant_id, kind, name, slug, description, status, created_by_user_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)",
    )
    .bind(product_id)
    .bind(organization_id)
    .bind(pageant_id)
    .bind(body.pageant_contestant_id)
    .bind(kind)
    .bind(name)
    .bind(slug)
    .bind(description)
    .bind(status)
    .bind(actor_user_id)
    .execute(&mut *tx)
    .await
    .map_err(map_database_error)?;

    sqlx::query(
        "INSERT INTO product_prices (id, product_id, amount_minor, asset_code, asset_scale, asset_issuer) VALUES ($1, $2, $3, $4, $5, $6)",
    )
    .bind(price_id)
    .bind(product_id)
    .bind(body.amount_minor)
    .bind(asset_code)
    .bind(body.asset_scale)
    .bind(asset_issuer)
    .execute(&mut *tx)
    .await
    .map_err(map_database_error)?;

    sqlx::query("INSERT INTO product_inventory (product_id, supply_limit) VALUES ($1, $2)")
        .bind(product_id)
        .bind(body.supply_limit)
        .execute(&mut *tx)
        .await
        .map_err(map_database_error)?;

    if let Some(media_asset_id) = body.primary_media_asset_id {
        sqlx::query(
            "INSERT INTO product_media (id, product_id, media_asset_id, role, sort_order) VALUES ($1, $2, $3, 'primary', 0)",
        )
        .bind(Uuid::new_v4())
        .bind(product_id)
        .bind(media_asset_id)
        .execute(&mut *tx)
        .await
        .map_err(map_database_error)?;
    }

    write_audit(
        &mut tx,
        organization_id,
        actor_user_id,
        "product.create",
        "product",
        product_id,
        serde_json::json!({
            "price_id": price_id,
            "pageant_id": pageant_id,
            "pageant_contestant_id": body.pageant_contestant_id,
        }),
    )
    .await?;
    tx.commit().await.map_err(map_database_error)?;

    let product = load_product(pool, product_id, false).await?;
    Ok((StatusCode::CREATED, Json(product)))
}

async fn list_products(
    State(state): State<AppState>,
    Path(organization_id): Path<Uuid>,
) -> Result<Json<Vec<ProductRecord>>, ApiError> {
    let pool = database_pool(&state)?;
    let products = sqlx::query_as::<_, ProductRecord>(
        "SELECT id, organization_id, pageant_id, pageant_contestant_id, kind, name, slug, description, status, created_by_user_id, created_at, updated_at FROM products WHERE organization_id = $1 AND status = 'published' ORDER BY created_at DESC",
    )
    .bind(organization_id)
    .fetch_all(pool)
    .await
    .map_err(map_database_error)?;
    Ok(Json(products))
}

async fn get_product(
    State(state): State<AppState>,
    Path(product_id): Path<Uuid>,
) -> Result<Json<ProductDetailResponse>, ApiError> {
    let pool = database_pool(&state)?;
    Ok(Json(load_product(pool, product_id, true).await?))
}

async fn create_collectible_collection(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(organization_id): Path<Uuid>,
    Json(body): Json<CreateCollectibleCollectionRequest>,
) -> Result<(StatusCode, Json<CollectibleCollectionRecord>), ApiError> {
    let actor_user_id = require_admin_actor(&state, &headers)?;
    let pool = database_pool(&state)?;
    require_organization_editor(pool, organization_id, actor_user_id).await?;

    let name = required_text(body.name, 200, "invalid_collection_name")?;
    let slug = required_slug(body.slug)?;
    let description = optional_text(body.description, 20_000, "invalid_collection_description")?;
    let status = validate_publication_status(body.status)?;
    let pageant_id = validate_catalogue_scope(
        pool,
        organization_id,
        body.pageant_id,
        body.pageant_contestant_id,
    )
    .await?;
    let contract_id = validate_optional_contract_id(body.contract_id)?;
    let metadata_sha256 = validate_optional_sha256(body.metadata_sha256)?;
    let collection_id = Uuid::new_v4();
    let mut tx = pool.begin().await.map_err(map_database_error)?;

    let collection = sqlx::query_as::<_, CollectibleCollectionRecord>(
        "INSERT INTO collectible_collections (id, organization_id, pageant_id, pageant_contestant_id, name, slug, description, status, contract_id, metadata_sha256, created_by_user_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id, organization_id, pageant_id, pageant_contestant_id, name, slug, description, status, contract_id, metadata_sha256, created_by_user_id, created_at, updated_at",
    )
    .bind(collection_id)
    .bind(organization_id)
    .bind(pageant_id)
    .bind(body.pageant_contestant_id)
    .bind(name)
    .bind(slug)
    .bind(description)
    .bind(status)
    .bind(contract_id)
    .bind(metadata_sha256)
    .bind(actor_user_id)
    .fetch_one(&mut *tx)
    .await
    .map_err(map_database_error)?;

    write_audit(
        &mut tx,
        organization_id,
        actor_user_id,
        "collectible_collection.create",
        "collectible_collection",
        collection_id,
        serde_json::json!({
            "pageant_id": pageant_id,
            "pageant_contestant_id": body.pageant_contestant_id,
        }),
    )
    .await?;
    tx.commit().await.map_err(map_database_error)?;
    Ok((StatusCode::CREATED, Json(collection)))
}

async fn list_collectible_collections(
    State(state): State<AppState>,
    Path(organization_id): Path<Uuid>,
) -> Result<Json<Vec<CollectibleCollectionRecord>>, ApiError> {
    let pool = database_pool(&state)?;
    let collections = sqlx::query_as::<_, CollectibleCollectionRecord>(
        "SELECT id, organization_id, pageant_id, pageant_contestant_id, name, slug, description, status, contract_id, metadata_sha256, created_by_user_id, created_at, updated_at FROM collectible_collections WHERE organization_id = $1 AND status = 'published' ORDER BY created_at DESC",
    )
    .bind(organization_id)
    .fetch_all(pool)
    .await
    .map_err(map_database_error)?;
    Ok(Json(collections))
}

async fn create_collectible_edition(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(collection_id): Path<Uuid>,
    Json(body): Json<CreateCollectibleEditionRequest>,
) -> Result<(StatusCode, Json<CollectibleEditionRecord>), ApiError> {
    let actor_user_id = require_admin_actor(&state, &headers)?;
    let pool = database_pool(&state)?;
    let organization_id = organization_for_collection(pool, collection_id).await?;
    require_organization_editor(pool, organization_id, actor_user_id).await?;

    if body.edition_number <= 0 {
        return Err(ApiError::InvalidRequest("invalid_edition_number"));
    }
    if body.supply_limit <= 0 {
        return Err(ApiError::InvalidRequest("invalid_supply_limit"));
    }
    let mint_policy = validate_mint_policy(body.mint_policy)?;
    let contract_id = validate_optional_contract_id(body.contract_id)?;
    let metadata_sha256 = validate_optional_sha256(body.metadata_sha256)?;

    let (product_organization_id, product_kind, product_status, inventory_limit) =
        sqlx::query_as::<_, (Uuid, String, String, Option<i64>)>(
            "SELECT p.organization_id, p.kind, p.status, i.supply_limit FROM products p JOIN product_inventory i ON i.product_id = p.id WHERE p.id = $1",
        )
        .bind(body.product_id)
        .fetch_optional(pool)
        .await
        .map_err(map_database_error)?
        .ok_or(ApiError::NotFound)?;
    if product_organization_id != organization_id {
        return Err(ApiError::Forbidden);
    }
    if product_kind != "collectible" || product_status == "archived" {
        return Err(ApiError::InvalidRequest("product_is_not_collectible"));
    }
    if inventory_limit.is_some_and(|limit| limit != body.supply_limit) {
        return Err(ApiError::Conflict("edition_supply_mismatch"));
    }
    if let Some(media_asset_id) = body.artwork_media_asset_id {
        require_public_media(pool, organization_id, media_asset_id).await?;
    }

    let edition_id = Uuid::new_v4();
    let mut tx = pool.begin().await.map_err(map_database_error)?;
    if inventory_limit.is_none() {
        sqlx::query(
            "UPDATE product_inventory SET supply_limit = $2, updated_at = now() WHERE product_id = $1",
        )
        .bind(body.product_id)
        .bind(body.supply_limit)
        .execute(&mut *tx)
        .await
        .map_err(map_database_error)?;
    }

    let edition = sqlx::query_as::<_, CollectibleEditionRecord>(
        "INSERT INTO collectible_editions (id, collection_id, product_id, edition_number, supply_limit, mint_policy, contract_id, metadata_sha256, artwork_media_asset_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id, collection_id, product_id, edition_number, supply_limit, mint_policy, contract_id, metadata_sha256, artwork_media_asset_id, created_at, updated_at",
    )
    .bind(edition_id)
    .bind(collection_id)
    .bind(body.product_id)
    .bind(body.edition_number)
    .bind(body.supply_limit)
    .bind(mint_policy)
    .bind(contract_id)
    .bind(metadata_sha256)
    .bind(body.artwork_media_asset_id)
    .fetch_one(&mut *tx)
    .await
    .map_err(map_database_error)?;

    write_audit(
        &mut tx,
        organization_id,
        actor_user_id,
        "collectible_edition.create",
        "collectible_edition",
        edition_id,
        serde_json::json!({
            "collection_id": collection_id,
            "product_id": body.product_id,
            "edition_number": body.edition_number,
        }),
    )
    .await?;
    tx.commit().await.map_err(map_database_error)?;
    Ok((StatusCode::CREATED, Json(edition)))
}

async fn list_collectible_editions(
    State(state): State<AppState>,
    Path(collection_id): Path<Uuid>,
) -> Result<Json<Vec<CollectibleEditionRecord>>, ApiError> {
    let pool = database_pool(&state)?;
    let published = sqlx::query_scalar::<_, bool>(
        "SELECT EXISTS (SELECT 1 FROM collectible_collections WHERE id = $1 AND status = 'published')",
    )
    .bind(collection_id)
    .fetch_one(pool)
    .await
    .map_err(map_database_error)?;
    if !published {
        return Err(ApiError::NotFound);
    }

    let editions = sqlx::query_as::<_, CollectibleEditionRecord>(
        "SELECT e.id, e.collection_id, e.product_id, e.edition_number, e.supply_limit, e.mint_policy, e.contract_id, e.metadata_sha256, e.artwork_media_asset_id, e.created_at, e.updated_at FROM collectible_editions e JOIN products p ON p.id = e.product_id WHERE e.collection_id = $1 AND p.status = 'published' ORDER BY e.edition_number",
    )
    .bind(collection_id)
    .fetch_all(pool)
    .await
    .map_err(map_database_error)?;
    Ok(Json(editions))
}

async fn load_product(
    pool: &PgPool,
    product_id: Uuid,
    published_only: bool,
) -> Result<ProductDetailResponse, ApiError> {
    let query = if published_only {
        "SELECT id, organization_id, pageant_id, pageant_contestant_id, kind, name, slug, description, status, created_by_user_id, created_at, updated_at FROM products WHERE id = $1 AND status = 'published'"
    } else {
        "SELECT id, organization_id, pageant_id, pageant_contestant_id, kind, name, slug, description, status, created_by_user_id, created_at, updated_at FROM products WHERE id = $1"
    };
    let product = sqlx::query_as::<_, ProductRecord>(query)
        .bind(product_id)
        .fetch_optional(pool)
        .await
        .map_err(map_database_error)?
        .ok_or(ApiError::NotFound)?;
    let prices = sqlx::query_as::<_, ProductPriceRecord>(
        "SELECT id, product_id, amount_minor, asset_code, asset_scale, asset_issuer, is_active, starts_at, ends_at, created_at FROM product_prices WHERE product_id = $1 AND is_active = true ORDER BY created_at DESC",
    )
    .bind(product_id)
    .fetch_all(pool)
    .await
    .map_err(map_database_error)?;
    let inventory = sqlx::query_as::<_, ProductInventoryRecord>(
        "SELECT product_id, supply_limit, reserved_quantity, fulfilled_quantity, updated_at FROM product_inventory WHERE product_id = $1",
    )
    .bind(product_id)
    .fetch_one(pool)
    .await
    .map_err(map_database_error)?;
    let media = sqlx::query_as::<_, ProductMediaRecord>(
        "SELECT id, product_id, media_asset_id, role, sort_order, created_at FROM product_media WHERE product_id = $1 ORDER BY CASE role WHEN 'primary' THEN 0 WHEN 'gallery' THEN 1 ELSE 2 END, sort_order, created_at",
    )
    .bind(product_id)
    .fetch_all(pool)
    .await
    .map_err(map_database_error)?;

    Ok(ProductDetailResponse {
        product,
        prices,
        inventory,
        media,
    })
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
        "SELECT EXISTS (SELECT 1 FROM organization_members WHERE organization_id = $1 AND user_id = $2 AND status = 'active' AND role IN ('owner', 'admin', 'editor'))",
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

async fn validate_catalogue_scope(
    pool: &PgPool,
    organization_id: Uuid,
    pageant_id: Option<Uuid>,
    pageant_contestant_id: Option<Uuid>,
) -> Result<Option<Uuid>, ApiError> {
    if let Some(pageant_contestant_id) = pageant_contestant_id {
        let scope = sqlx::query_as::<_, (Uuid, Uuid)>(
            "SELECT p.organization_id, p.id FROM pageant_contestants pc JOIN pageants p ON p.id = pc.pageant_id WHERE pc.id = $1",
        )
        .bind(pageant_contestant_id)
        .fetch_optional(pool)
        .await
        .map_err(map_database_error)?
        .ok_or(ApiError::InvalidRequest("pageant_contestant_not_found"))?;
        if scope.0 != organization_id {
            return Err(ApiError::Forbidden);
        }
        if pageant_id.is_some_and(|requested| requested != scope.1) {
            return Err(ApiError::InvalidRequest(
                "pageant_contestant_scope_mismatch",
            ));
        }
        return Ok(Some(scope.1));
    }

    if let Some(pageant_id) = pageant_id {
        let owner =
            sqlx::query_scalar::<_, Uuid>("SELECT organization_id FROM pageants WHERE id = $1")
                .bind(pageant_id)
                .fetch_optional(pool)
                .await
                .map_err(map_database_error)?
                .ok_or(ApiError::InvalidRequest("pageant_not_found"))?;
        if owner != organization_id {
            return Err(ApiError::Forbidden);
        }
    }
    Ok(pageant_id)
}

async fn require_public_media(
    pool: &PgPool,
    organization_id: Uuid,
    media_asset_id: Uuid,
) -> Result<(), ApiError> {
    let allowed = sqlx::query_scalar::<_, bool>(
        "SELECT EXISTS (SELECT 1 FROM media_assets WHERE id = $1 AND organization_id = $2 AND status = 'ready' AND visibility IN ('public', 'unlisted'))",
    )
    .bind(media_asset_id)
    .bind(organization_id)
    .fetch_one(pool)
    .await
    .map_err(map_database_error)?;
    if allowed {
        Ok(())
    } else {
        Err(ApiError::InvalidRequest("media_not_public_and_ready"))
    }
}

async fn organization_for_collection(pool: &PgPool, collection_id: Uuid) -> Result<Uuid, ApiError> {
    sqlx::query_scalar::<_, Uuid>(
        "SELECT organization_id FROM collectible_collections WHERE id = $1",
    )
    .bind(collection_id)
    .fetch_optional(pool)
    .await
    .map_err(map_database_error)?
    .ok_or(ApiError::NotFound)
}

async fn write_audit(
    tx: &mut Transaction<'_, Postgres>,
    organization_id: Uuid,
    actor_user_id: Uuid,
    action: &str,
    entity_type: &str,
    entity_id: Uuid,
    metadata: Value,
) -> Result<(), ApiError> {
    sqlx::query(
        "INSERT INTO audit_logs (id, organization_id, actor_user_id, action, entity_type, entity_id, metadata) VALUES ($1, $2, $3, $4, $5, $6, $7)",
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

fn validate_product_kind(value: String) -> Result<String, ApiError> {
    let value = value.trim().to_ascii_lowercase();
    if matches!(
        value.as_str(),
        "collectible" | "ticket" | "merchandise" | "donation"
    ) {
        Ok(value)
    } else {
        Err(ApiError::InvalidRequest("invalid_product_kind"))
    }
}

fn validate_publication_status(value: Option<String>) -> Result<String, ApiError> {
    let value = value.unwrap_or_else(|| "draft".to_string());
    let value = value.trim().to_ascii_lowercase();
    if matches!(value.as_str(), "draft" | "published") {
        Ok(value)
    } else {
        Err(ApiError::InvalidRequest("invalid_publication_status"))
    }
}

fn validate_mint_policy(value: Option<String>) -> Result<String, ApiError> {
    let value = value.unwrap_or_else(|| "on_purchase".to_string());
    let value = value.trim().to_ascii_lowercase();
    if matches!(value.as_str(), "on_purchase" | "pre_minted" | "manual") {
        Ok(value)
    } else {
        Err(ApiError::InvalidRequest("invalid_mint_policy"))
    }
}

fn validate_stellar_asset(
    asset_code: String,
    asset_issuer: Option<String>,
) -> Result<(String, Option<String>), ApiError> {
    let asset_code = asset_code.trim().to_ascii_uppercase();
    if asset_code.is_empty()
        || asset_code.len() > 12
        || !asset_code
            .chars()
            .all(|character| character.is_ascii_uppercase() || character.is_ascii_digit())
    {
        return Err(ApiError::InvalidRequest("invalid_asset_code"));
    }

    let asset_issuer = asset_issuer
        .map(|issuer| issuer.trim().to_ascii_uppercase())
        .filter(|issuer| !issuer.is_empty());
    if asset_code == "XLM" {
        if asset_issuer.is_some() {
            return Err(ApiError::InvalidRequest("xlm_must_not_have_issuer"));
        }
        return Ok((asset_code, None));
    }

    let issuer = asset_issuer.ok_or(ApiError::InvalidRequest("asset_issuer_required"))?;
    if !is_stellar_address(&issuer, 'G') {
        return Err(ApiError::InvalidRequest("invalid_asset_issuer"));
    }
    Ok((asset_code, Some(issuer)))
}

fn validate_optional_contract_id(value: Option<String>) -> Result<Option<String>, ApiError> {
    value
        .map(|value| {
            let value = value.trim().to_ascii_uppercase();
            if is_stellar_address(&value, 'C') {
                Ok(value)
            } else {
                Err(ApiError::InvalidRequest("invalid_contract_id"))
            }
        })
        .transpose()
}

fn is_stellar_address(value: &str, prefix: char) -> bool {
    value.len() == 56
        && value.starts_with(prefix)
        && value
            .chars()
            .skip(1)
            .all(|character| character.is_ascii_uppercase() || ('2'..='7').contains(&character))
}

fn validate_optional_sha256(value: Option<String>) -> Result<Option<String>, ApiError> {
    value
        .map(|value| {
            let value = value.trim().to_ascii_lowercase();
            if value.len() == 64 && value.chars().all(|character| character.is_ascii_hexdigit()) {
                Ok(value)
            } else {
                Err(ApiError::InvalidRequest("invalid_metadata_sha256"))
            }
        })
        .transpose()
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
                tracing::error!(error = %error, "commerce database operation failed");
                ApiError::Database
            }
        };
    }

    tracing::error!(error = %error, "commerce database operation failed");
    ApiError::Database
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validates_integer_stellar_assets() {
        assert_eq!(
            validate_stellar_asset("xlm".to_string(), None).unwrap(),
            ("XLM".to_string(), None)
        );
        assert!(validate_stellar_asset("USDC".to_string(), None).is_err());
    }

    #[test]
    fn validates_catalogue_slugs() {
        assert_eq!(
            required_slug("Fan-Edition-1".to_string()).unwrap(),
            "fan-edition-1"
        );
        assert!(required_slug("fan edition".to_string()).is_err());
    }

    #[test]
    fn validates_metadata_hashes() {
        let hash = "A".repeat(64);
        assert_eq!(
            validate_optional_sha256(Some(hash)).unwrap().unwrap(),
            "a".repeat(64)
        );
    }
}
