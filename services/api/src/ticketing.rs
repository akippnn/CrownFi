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

use crate::{error::ApiError, state::AppState};

const RESERVATION_MINUTES: i64 = 15;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/ticketing/pageants/:pageant_id/events", get(list_events))
        .route("/ticketing/events", post(create_event))
        .route(
            "/ticketing/events/:event_id/products",
            get(list_products).post(create_product),
        )
        .route(
            "/ticketing/events/:event_id/on-sale",
            post(put_event_on_sale),
        )
        .route(
            "/ticketing/products/:ticket_product_id/reservations",
            post(create_reservation),
        )
        .route(
            "/ticketing/reservations/:reservation_id",
            get(get_reservation),
        )
}

#[derive(Debug, Clone, Serialize, FromRow)]
struct TicketEventRecord {
    id: Uuid,
    organization_id: Uuid,
    pageant_id: Uuid,
    slug: String,
    title: String,
    description: Option<String>,
    venue_name: Option<String>,
    starts_at: OffsetDateTime,
    ends_at: Option<OffsetDateTime>,
    status: String,
    default_transfer_policy: String,
    created_by_user_id: Uuid,
    created_at: OffsetDateTime,
    updated_at: OffsetDateTime,
}

#[derive(Debug, Clone, Serialize, FromRow)]
struct TicketProductRecord {
    ticket_product_id: Uuid,
    ticket_event_id: Uuid,
    product_id: Uuid,
    name: String,
    slug: String,
    description: Option<String>,
    product_status: String,
    tier_name: String,
    per_user_limit: i32,
    sale_starts_at: OffsetDateTime,
    sale_ends_at: OffsetDateTime,
    transfer_policy: String,
    resale_price_cap_minor: Option<i64>,
    amount_minor: i64,
    asset_code: String,
    asset_scale: i16,
    asset_issuer: Option<String>,
    supply_limit: Option<i64>,
    reserved_quantity: i64,
    fulfilled_quantity: i64,
}

#[derive(Debug, Deserialize)]
struct CreateEventRequest {
    organization_id: Uuid,
    pageant_id: Uuid,
    slug: String,
    title: String,
    description: Option<String>,
    venue_name: Option<String>,
    starts_at: String,
    ends_at: Option<String>,
    default_transfer_policy: String,
}

#[derive(Debug, Deserialize)]
struct CreateProductRequest {
    name: String,
    slug: String,
    description: Option<String>,
    tier_name: String,
    supply_limit: i64,
    per_user_limit: i32,
    sale_starts_at: String,
    sale_ends_at: String,
    transfer_policy: Option<String>,
    resale_price_cap_minor: Option<i64>,
    amount_minor: i64,
    asset_code: String,
    asset_scale: i16,
    asset_issuer: Option<String>,
}

#[derive(Debug, Deserialize)]
struct PutOnSaleRequest {
    reason: String,
}

#[derive(Debug, Deserialize)]
struct CreateReservationRequest {
    quantity: i64,
    idempotency_key: String,
}

#[derive(Debug, Clone, Serialize, FromRow)]
struct ReservationRecord {
    reservation_id: Uuid,
    ticket_product_id: Uuid,
    order_id: Uuid,
    buyer_user_id: Uuid,
    quantity: i64,
    reservation_status: String,
    expires_at: OffsetDateTime,
    order_status: String,
    amount_minor: i64,
    asset_code: String,
    asset_scale: i16,
    asset_issuer: Option<String>,
    created_at: OffsetDateTime,
}

#[derive(Debug, Clone, FromRow)]
struct AvailabilityRecord {
    organization_id: Uuid,
    pageant_id: Uuid,
    event_status: String,
    product_id: Uuid,
    product_name: String,
    product_status: String,
    per_user_limit: i32,
    sale_starts_at: OffsetDateTime,
    sale_ends_at: OffsetDateTime,
    amount_minor: i64,
    asset_code: String,
    asset_scale: i16,
    asset_issuer: Option<String>,
    supply_limit: Option<i64>,
    reserved_quantity: i64,
    fulfilled_quantity: i64,
}

async fn list_events(
    State(state): State<AppState>,
    Path(pageant_id): Path<Uuid>,
) -> Result<Json<Vec<TicketEventRecord>>, ApiError> {
    let records = sqlx::query_as::<_, TicketEventRecord>(
        "SELECT id, organization_id, pageant_id, slug, title, description, venue_name, starts_at, ends_at, status, default_transfer_policy, created_by_user_id, created_at, updated_at FROM ticket_events WHERE pageant_id = $1 AND status IN ('on_sale','off_sale','completed') ORDER BY starts_at, created_at",
    )
    .bind(pageant_id)
    .fetch_all(database_pool(&state)?)
    .await
    .map_err(map_database_error)?;
    Ok(Json(records))
}

async fn create_event(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(body): Json<CreateEventRequest>,
) -> Result<(StatusCode, Json<TicketEventRecord>), ApiError> {
    let actor_user_id = require_web_actor(&state, &headers)?;
    let pool = database_pool(&state)?;
    require_organization_editor(pool, body.organization_id, actor_user_id).await?;

    let pageant_matches = sqlx::query_scalar::<_, bool>(
        "SELECT EXISTS (SELECT 1 FROM pageants WHERE id = $1 AND organization_id = $2)",
    )
    .bind(body.pageant_id)
    .bind(body.organization_id)
    .fetch_one(pool)
    .await
    .map_err(map_database_error)?;
    if !pageant_matches {
        return Err(ApiError::InvalidRequest(
            "ticket_pageant_organization_mismatch",
        ));
    }

    let slug = validate_slug(body.slug, "invalid_ticket_event_slug")?;
    let title = required_text(body.title, 200, "invalid_ticket_event_title")?;
    let description = optional_text(body.description, 4000, "invalid_ticket_event_description")?;
    let venue_name = optional_text(body.venue_name, 300, "invalid_ticket_venue")?;
    let starts_at = parse_timestamp(&body.starts_at, "invalid_ticket_event_start")?;
    let ends_at = body
        .ends_at
        .as_deref()
        .map(|value| parse_timestamp(value, "invalid_ticket_event_end"))
        .transpose()?;
    if ends_at.is_some_and(|end| end < starts_at) {
        return Err(ApiError::InvalidRequest("ticket_event_end_before_start"));
    }
    let transfer_policy = validate_transfer_policy(body.default_transfer_policy)?;

    let event_id = Uuid::new_v4();
    let mut tx = pool.begin().await.map_err(map_database_error)?;
    sqlx::query(
        "INSERT INTO ticket_events (id, organization_id, pageant_id, slug, title, description, venue_name, starts_at, ends_at, status, default_transfer_policy, created_by_user_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'draft',$10,$11)",
    )
    .bind(event_id)
    .bind(body.organization_id)
    .bind(body.pageant_id)
    .bind(&slug)
    .bind(&title)
    .bind(&description)
    .bind(&venue_name)
    .bind(starts_at)
    .bind(ends_at)
    .bind(&transfer_policy)
    .bind(actor_user_id)
    .execute(&mut *tx)
    .await
    .map_err(map_database_error)?;
    write_audit(
        &mut tx,
        body.organization_id,
        actor_user_id,
        "ticket_event.create",
        "ticket_event",
        event_id,
        json!({"pageant_id": body.pageant_id, "slug": slug}),
    )
    .await?;
    tx.commit().await.map_err(map_database_error)?;

    Ok((StatusCode::CREATED, Json(load_event(pool, event_id).await?)))
}

async fn list_products(
    State(state): State<AppState>,
    Path(event_id): Path<Uuid>,
) -> Result<Json<Vec<TicketProductRecord>>, ApiError> {
    Ok(Json(load_products(database_pool(&state)?, event_id).await?))
}

async fn create_product(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(event_id): Path<Uuid>,
    Json(body): Json<CreateProductRequest>,
) -> Result<(StatusCode, Json<TicketProductRecord>), ApiError> {
    let actor_user_id = require_web_actor(&state, &headers)?;
    let pool = database_pool(&state)?;
    let event = load_event(pool, event_id).await?;
    require_organization_editor(pool, event.organization_id, actor_user_id).await?;
    if event.status != "draft" {
        return Err(ApiError::Conflict("ticket_event_catalogue_locked"));
    }

    let name = required_text(body.name, 200, "invalid_ticket_product_name")?;
    let slug = validate_slug(body.slug, "invalid_ticket_product_slug")?;
    let description = optional_text(body.description, 4000, "invalid_ticket_product_description")?;
    let tier_name = required_text(body.tier_name, 120, "invalid_ticket_tier")?;
    if body.supply_limit <= 0 || body.per_user_limit <= 0 || body.per_user_limit > 20 {
        return Err(ApiError::InvalidRequest("invalid_ticket_inventory_limits"));
    }
    if i64::from(body.per_user_limit) > body.supply_limit {
        return Err(ApiError::InvalidRequest("ticket_user_limit_exceeds_supply"));
    }
    if body.amount_minor <= 0 || !(0..=7).contains(&body.asset_scale) {
        return Err(ApiError::InvalidRequest("invalid_ticket_price"));
    }
    let (asset_code, asset_issuer) = validate_asset(body.asset_code, body.asset_issuer)?;
    let sale_starts_at = parse_timestamp(&body.sale_starts_at, "invalid_ticket_sale_start")?;
    let sale_ends_at = parse_timestamp(&body.sale_ends_at, "invalid_ticket_sale_end")?;
    if sale_ends_at <= sale_starts_at || sale_ends_at > event.starts_at {
        return Err(ApiError::InvalidRequest("invalid_ticket_sale_window"));
    }
    let transfer_policy = body
        .transfer_policy
        .map(validate_transfer_policy)
        .transpose()?
        .unwrap_or_else(|| event.default_transfer_policy.clone());
    if body
        .resale_price_cap_minor
        .is_some_and(|amount| amount <= 0)
    {
        return Err(ApiError::InvalidRequest("invalid_ticket_resale_cap"));
    }

    let product_id = Uuid::new_v4();
    let price_id = Uuid::new_v4();
    let ticket_product_id = Uuid::new_v4();
    let mut tx = pool.begin().await.map_err(map_database_error)?;
    sqlx::query(
        "INSERT INTO products (id, organization_id, pageant_id, kind, name, slug, description, status, created_by_user_id) VALUES ($1,$2,$3,'ticket',$4,$5,$6,'draft',$7)",
    )
    .bind(product_id)
    .bind(event.organization_id)
    .bind(event.pageant_id)
    .bind(&name)
    .bind(&slug)
    .bind(&description)
    .bind(actor_user_id)
    .execute(&mut *tx)
    .await
    .map_err(map_database_error)?;
    sqlx::query(
        "INSERT INTO product_prices (id, product_id, amount_minor, asset_code, asset_scale, asset_issuer, is_active, starts_at, ends_at) VALUES ($1,$2,$3,$4,$5,$6,true,$7,$8)",
    )
    .bind(price_id)
    .bind(product_id)
    .bind(body.amount_minor)
    .bind(&asset_code)
    .bind(body.asset_scale)
    .bind(&asset_issuer)
    .bind(sale_starts_at)
    .bind(sale_ends_at)
    .execute(&mut *tx)
    .await
    .map_err(map_database_error)?;
    sqlx::query("INSERT INTO product_inventory (product_id, supply_limit) VALUES ($1,$2)")
        .bind(product_id)
        .bind(body.supply_limit)
        .execute(&mut *tx)
        .await
        .map_err(map_database_error)?;
    sqlx::query(
        "INSERT INTO ticket_products (id, ticket_event_id, product_id, tier_name, per_user_limit, sale_starts_at, sale_ends_at, transfer_policy, resale_price_cap_minor) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)",
    )
    .bind(ticket_product_id)
    .bind(event_id)
    .bind(product_id)
    .bind(&tier_name)
    .bind(body.per_user_limit)
    .bind(sale_starts_at)
    .bind(sale_ends_at)
    .bind(&transfer_policy)
    .bind(body.resale_price_cap_minor)
    .execute(&mut *tx)
    .await
    .map_err(map_database_error)?;
    write_audit(
        &mut tx,
        event.organization_id,
        actor_user_id,
        "ticket_product.create",
        "ticket_product",
        ticket_product_id,
        json!({"event_id": event_id, "product_id": product_id, "price_id": price_id, "supply_limit": body.supply_limit}),
    )
    .await?;
    tx.commit().await.map_err(map_database_error)?;

    let record = load_products(pool, event_id)
        .await?
        .into_iter()
        .find(|record| record.ticket_product_id == ticket_product_id)
        .ok_or(ApiError::NotFound)?;
    Ok((StatusCode::CREATED, Json(record)))
}

async fn put_event_on_sale(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(event_id): Path<Uuid>,
    Json(body): Json<PutOnSaleRequest>,
) -> Result<Json<TicketEventRecord>, ApiError> {
    let actor_user_id = require_web_actor(&state, &headers)?;
    let pool = database_pool(&state)?;
    let reason = required_text(body.reason, 1000, "invalid_ticket_transition_reason")?;
    let mut tx = pool.begin().await.map_err(map_database_error)?;
    let event = sqlx::query_as::<_, TicketEventRecord>(
        "SELECT id, organization_id, pageant_id, slug, title, description, venue_name, starts_at, ends_at, status, default_transfer_policy, created_by_user_id, created_at, updated_at FROM ticket_events WHERE id = $1 FOR UPDATE",
    )
    .bind(event_id)
    .fetch_optional(&mut *tx)
    .await
    .map_err(map_database_error)?
    .ok_or(ApiError::NotFound)?;
    require_organization_editor_tx(&mut tx, event.organization_id, actor_user_id).await?;
    if event.status != "draft" {
        return Err(ApiError::Conflict("ticket_event_not_publishable"));
    }
    let product_count = sqlx::query_scalar::<_, i64>(
        "SELECT COUNT(*)::BIGINT FROM ticket_products WHERE ticket_event_id = $1",
    )
    .bind(event_id)
    .fetch_one(&mut *tx)
    .await
    .map_err(map_database_error)?;
    if product_count == 0 {
        return Err(ApiError::Conflict("ticket_event_requires_products"));
    }
    sqlx::query("UPDATE ticket_events SET status = 'on_sale', updated_at = now() WHERE id = $1")
        .bind(event_id)
        .execute(&mut *tx)
        .await
        .map_err(map_database_error)?;
    sqlx::query("UPDATE products SET status = 'published', updated_at = now() WHERE id IN (SELECT product_id FROM ticket_products WHERE ticket_event_id = $1)")
        .bind(event_id)
        .execute(&mut *tx)
        .await
        .map_err(map_database_error)?;
    write_audit(
        &mut tx,
        event.organization_id,
        actor_user_id,
        "ticket_event.on_sale",
        "ticket_event",
        event_id,
        json!({"reason": reason, "product_count": product_count}),
    )
    .await?;
    tx.commit().await.map_err(map_database_error)?;
    Ok(Json(load_event(pool, event_id).await?))
}

async fn create_reservation(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(ticket_product_id): Path<Uuid>,
    Json(body): Json<CreateReservationRequest>,
) -> Result<(StatusCode, Json<ReservationRecord>), ApiError> {
    let buyer_user_id = require_web_actor(&state, &headers)?;
    if body.quantity <= 0 {
        return Err(ApiError::InvalidRequest("invalid_ticket_quantity"));
    }
    let idempotency_key =
        required_text(body.idempotency_key, 200, "invalid_ticket_idempotency_key")?;
    let pool = database_pool(&state)?;
    let mut tx = pool.begin().await.map_err(map_database_error)?;

    release_expired_for_product(&mut tx, ticket_product_id).await?;
    let availability = sqlx::query_as::<_, AvailabilityRecord>(
        "SELECT te.organization_id, te.pageant_id, te.status AS event_status, p.id AS product_id, p.name AS product_name, p.status AS product_status, tp.per_user_limit, tp.sale_starts_at, tp.sale_ends_at, pp.amount_minor, pp.asset_code, pp.asset_scale, pp.asset_issuer, pi.supply_limit, pi.reserved_quantity, pi.fulfilled_quantity FROM ticket_products tp JOIN ticket_events te ON te.id = tp.ticket_event_id JOIN products p ON p.id = tp.product_id JOIN product_prices pp ON pp.product_id = p.id AND pp.is_active = true JOIN product_inventory pi ON pi.product_id = p.id WHERE tp.id = $1 FOR UPDATE OF tp, te, p, pp, pi",
    )
    .bind(ticket_product_id)
    .fetch_optional(&mut *tx)
    .await
    .map_err(map_database_error)?
    .ok_or(ApiError::NotFound)?;

    let now = OffsetDateTime::now_utc();
    if availability.event_status != "on_sale"
        || availability.product_status != "published"
        || now < availability.sale_starts_at
        || now >= availability.sale_ends_at
    {
        return Err(ApiError::Conflict("ticket_not_on_sale"));
    }
    let buyer_valid = sqlx::query_scalar::<_, bool>(
        "SELECT EXISTS (SELECT 1 FROM users WHERE id = $1 AND status = 'active') AND EXISTS (SELECT 1 FROM stellar_accounts WHERE user_id = $1 AND network = 'testnet' AND verified_at IS NOT NULL)",
    )
    .bind(buyer_user_id)
    .fetch_one(&mut *tx)
    .await
    .map_err(map_database_error)?;
    if !buyer_valid {
        return Err(ApiError::Forbidden);
    }

    let request_sha256 = hash_text(&format!(
        "ticket_product={ticket_product_id};buyer={buyer_user_id};quantity={};key={idempotency_key}",
        body.quantity
    ));
    if let Some((reservation_id, existing_hash)) = sqlx::query_as::<_, (Uuid, String)>(
        "SELECT id, request_sha256 FROM ticket_reservations WHERE organization_id = $1 AND buyer_user_id = $2 AND idempotency_key = $3 FOR UPDATE",
    )
    .bind(availability.organization_id)
    .bind(buyer_user_id)
    .bind(&idempotency_key)
    .fetch_optional(&mut *tx)
    .await
    .map_err(map_database_error)?
    {
        if existing_hash != request_sha256 {
            return Err(ApiError::Conflict("ticket_idempotency_key_reused"));
        }
        tx.commit().await.map_err(map_database_error)?;
        return Ok((StatusCode::OK, Json(load_reservation(pool, reservation_id).await?)));
    }

    let existing_quantity = sqlx::query_scalar::<_, i64>(
        "SELECT COALESCE(SUM(quantity),0)::BIGINT FROM ticket_reservations WHERE ticket_product_id = $1 AND buyer_user_id = $2 AND status IN ('reserved','converted')",
    )
    .bind(ticket_product_id)
    .bind(buyer_user_id)
    .fetch_one(&mut *tx)
    .await
    .map_err(map_database_error)?;
    if existing_quantity + body.quantity > i64::from(availability.per_user_limit) {
        return Err(ApiError::Conflict("ticket_per_user_limit_exceeded"));
    }
    if availability.supply_limit.is_some_and(|limit| {
        availability.reserved_quantity + availability.fulfilled_quantity + body.quantity > limit
    }) {
        return Err(ApiError::Conflict("ticket_inventory_unavailable"));
    }

    let total_amount_minor = availability
        .amount_minor
        .checked_mul(body.quantity)
        .ok_or(ApiError::InvalidRequest("ticket_amount_overflow"))?;
    let order_id = Uuid::new_v4();
    let reservation_id = Uuid::new_v4();
    let expires_at = now + Duration::minutes(RESERVATION_MINUTES);
    sqlx::query(
        "INSERT INTO orders (id, organization_id, buyer_user_id, status, environment, idempotency_key, request_sha256, amount_minor, asset_code, asset_scale, asset_issuer, expires_at) VALUES ($1,$2,$3,'awaiting_payment','testnet',$4,$5,$6,$7,$8,$9,$10)",
    )
    .bind(order_id)
    .bind(availability.organization_id)
    .bind(buyer_user_id)
    .bind(&idempotency_key)
    .bind(&request_sha256)
    .bind(total_amount_minor)
    .bind(&availability.asset_code)
    .bind(availability.asset_scale)
    .bind(&availability.asset_issuer)
    .bind(expires_at)
    .execute(&mut *tx)
    .await
    .map_err(map_database_error)?;
    sqlx::query(
        "INSERT INTO order_items (id, order_id, product_id, product_name, quantity, unit_amount_minor, total_amount_minor, asset_code, asset_scale, asset_issuer) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)",
    )
    .bind(Uuid::new_v4())
    .bind(order_id)
    .bind(availability.product_id)
    .bind(&availability.product_name)
    .bind(body.quantity)
    .bind(availability.amount_minor)
    .bind(total_amount_minor)
    .bind(&availability.asset_code)
    .bind(availability.asset_scale)
    .bind(&availability.asset_issuer)
    .execute(&mut *tx)
    .await
    .map_err(map_database_error)?;
    let updated = sqlx::query(
        "UPDATE product_inventory SET reserved_quantity = reserved_quantity + $2, updated_at = now() WHERE product_id = $1 AND (supply_limit IS NULL OR reserved_quantity + fulfilled_quantity + $2 <= supply_limit)",
    )
    .bind(availability.product_id)
    .bind(body.quantity)
    .execute(&mut *tx)
    .await
    .map_err(map_database_error)?;
    if updated.rows_affected() != 1 {
        return Err(ApiError::Conflict("ticket_inventory_unavailable"));
    }
    sqlx::query(
        "INSERT INTO ticket_reservations (id, organization_id, ticket_product_id, order_id, buyer_user_id, quantity, status, idempotency_key, request_sha256, expires_at) VALUES ($1,$2,$3,$4,$5,$6,'reserved',$7,$8,$9)",
    )
    .bind(reservation_id)
    .bind(availability.organization_id)
    .bind(ticket_product_id)
    .bind(order_id)
    .bind(buyer_user_id)
    .bind(body.quantity)
    .bind(&idempotency_key)
    .bind(&request_sha256)
    .bind(expires_at)
    .execute(&mut *tx)
    .await
    .map_err(map_database_error)?;
    write_audit(
        &mut tx,
        availability.organization_id,
        buyer_user_id,
        "ticket_reservation.create",
        "ticket_reservation",
        reservation_id,
        json!({"ticket_product_id": ticket_product_id, "order_id": order_id, "quantity": body.quantity, "expires_at": expires_at}),
    )
    .await?;
    tx.commit().await.map_err(map_database_error)?;

    Ok((
        StatusCode::CREATED,
        Json(load_reservation(pool, reservation_id).await?),
    ))
}

async fn get_reservation(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(reservation_id): Path<Uuid>,
) -> Result<Json<ReservationRecord>, ApiError> {
    let actor_user_id = require_web_actor(&state, &headers)?;
    let record = load_reservation(database_pool(&state)?, reservation_id).await?;
    if record.buyer_user_id != actor_user_id {
        return Err(ApiError::NotFound);
    }
    Ok(Json(record))
}

async fn release_expired_for_product(
    tx: &mut Transaction<'_, Postgres>,
    ticket_product_id: Uuid,
) -> Result<(), ApiError> {
    let expired = sqlx::query_as::<_, (Uuid, Uuid, i64, Uuid)>(
        "SELECT tr.id, tr.order_id, tr.quantity, tp.product_id FROM ticket_reservations tr JOIN ticket_products tp ON tp.id = tr.ticket_product_id WHERE tr.ticket_product_id = $1 AND tr.status = 'reserved' AND tr.expires_at <= now() FOR UPDATE OF tr",
    )
    .bind(ticket_product_id)
    .fetch_all(&mut **tx)
    .await
    .map_err(map_database_error)?;
    for (reservation_id, order_id, quantity, product_id) in expired {
        sqlx::query("UPDATE ticket_reservations SET status = 'expired', released_at = now(), updated_at = now() WHERE id = $1")
            .bind(reservation_id)
            .execute(&mut **tx)
            .await
            .map_err(map_database_error)?;
        sqlx::query("UPDATE orders SET status = 'expired', updated_at = now() WHERE id = $1 AND status = 'awaiting_payment'")
            .bind(order_id)
            .execute(&mut **tx)
            .await
            .map_err(map_database_error)?;
        sqlx::query("UPDATE product_inventory SET reserved_quantity = GREATEST(0, reserved_quantity - $2), updated_at = now() WHERE product_id = $1")
            .bind(product_id)
            .bind(quantity)
            .execute(&mut **tx)
            .await
            .map_err(map_database_error)?;
    }
    Ok(())
}

async fn load_event(pool: &PgPool, event_id: Uuid) -> Result<TicketEventRecord, ApiError> {
    sqlx::query_as::<_, TicketEventRecord>(
        "SELECT id, organization_id, pageant_id, slug, title, description, venue_name, starts_at, ends_at, status, default_transfer_policy, created_by_user_id, created_at, updated_at FROM ticket_events WHERE id = $1",
    )
    .bind(event_id)
    .fetch_optional(pool)
    .await
    .map_err(map_database_error)?
    .ok_or(ApiError::NotFound)
}

async fn load_products(
    pool: &PgPool,
    event_id: Uuid,
) -> Result<Vec<TicketProductRecord>, ApiError> {
    sqlx::query_as::<_, TicketProductRecord>(
        "SELECT tp.id AS ticket_product_id, tp.ticket_event_id, p.id AS product_id, p.name, p.slug, p.description, p.status AS product_status, tp.tier_name, tp.per_user_limit, tp.sale_starts_at, tp.sale_ends_at, tp.transfer_policy, tp.resale_price_cap_minor, pp.amount_minor, pp.asset_code, pp.asset_scale, pp.asset_issuer, pi.supply_limit, pi.reserved_quantity, pi.fulfilled_quantity FROM ticket_products tp JOIN products p ON p.id = tp.product_id JOIN product_prices pp ON pp.product_id = p.id AND pp.is_active = true JOIN product_inventory pi ON pi.product_id = p.id WHERE tp.ticket_event_id = $1 ORDER BY pp.amount_minor, tp.tier_name",
    )
    .bind(event_id)
    .fetch_all(pool)
    .await
    .map_err(map_database_error)
}

async fn load_reservation(
    pool: &PgPool,
    reservation_id: Uuid,
) -> Result<ReservationRecord, ApiError> {
    sqlx::query_as::<_, ReservationRecord>(
        "SELECT tr.id AS reservation_id, tr.ticket_product_id, tr.order_id, tr.buyer_user_id, tr.quantity, tr.status AS reservation_status, tr.expires_at, o.status AS order_status, o.amount_minor, o.asset_code, o.asset_scale, o.asset_issuer, tr.created_at FROM ticket_reservations tr JOIN orders o ON o.id = tr.order_id WHERE tr.id = $1",
    )
    .bind(reservation_id)
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

fn require_web_actor(state: &AppState, headers: &HeaderMap) -> Result<Uuid, ApiError> {
    let token = headers
        .get("x-crownfi-web-token")
        .and_then(|value| value.to_str().ok())
        .unwrap_or_default();
    if state.config.web_internal_token.is_empty() || token != state.config.web_internal_token {
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

fn validate_slug(value: String, code: &'static str) -> Result<String, ApiError> {
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
        Err(ApiError::InvalidRequest(code))
    }
}

fn validate_transfer_policy(value: String) -> Result<String, ApiError> {
    let value = value.trim().to_ascii_lowercase();
    if matches!(
        value.as_str(),
        "non_transferable" | "organizer_approved" | "open"
    ) {
        Ok(value)
    } else {
        Err(ApiError::InvalidRequest("invalid_ticket_transfer_policy"))
    }
}

fn validate_asset(
    code: String,
    issuer: Option<String>,
) -> Result<(String, Option<String>), ApiError> {
    let code = code.trim().to_ascii_uppercase();
    if code.is_empty()
        || code.len() > 12
        || !code
            .chars()
            .all(|character| character.is_ascii_uppercase() || character.is_ascii_digit())
    {
        return Err(ApiError::InvalidRequest("invalid_ticket_asset_code"));
    }
    let issuer = issuer
        .map(|value| value.trim().to_ascii_uppercase())
        .filter(|value| !value.is_empty());
    if code == "XLM" {
        if issuer.is_some() {
            return Err(ApiError::InvalidRequest(
                "xlm_ticket_price_must_not_have_issuer",
            ));
        }
    } else if issuer
        .as_deref()
        .is_none_or(|value| value.len() != 56 || !value.starts_with('G'))
    {
        return Err(ApiError::InvalidRequest("ticket_asset_issuer_required"));
    }
    Ok((code, issuer))
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

fn map_database_error(error: sqlx::Error) -> ApiError {
    if let Some(database_error) = error.as_database_error() {
        let code = database_error.code().map(|code| code.into_owned());
        return match code.as_deref() {
            Some("23505") => ApiError::Conflict("ticket_resource_already_exists"),
            Some("23503") => ApiError::InvalidRequest("ticket_related_resource_not_found"),
            Some("23514") | Some("22P02") => ApiError::InvalidRequest("ticket_constraint_failed"),
            _ => {
                tracing::error!(error = %error, "ticketing database operation failed");
                ApiError::Database
            }
        };
    }
    tracing::error!(error = %error, "ticketing database operation failed");
    ApiError::Database
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn transfer_policy_is_fail_closed() {
        assert_eq!(validate_transfer_policy("open".into()).unwrap(), "open");
        assert!(validate_transfer_policy("anything".into()).is_err());
    }

    #[test]
    fn ticket_request_hash_is_stable() {
        assert_eq!(hash_text("ticket|buyer|1"), hash_text("ticket|buyer|1"));
    }
}
