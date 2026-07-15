use axum::{
    extract::{Path, State},
    http::{HeaderMap, StatusCode},
    routing::{get, post},
    Json, Router,
};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};
use sqlx::{FromRow, PgPool, Postgres, Transaction};
use time::OffsetDateTime;
use uuid::Uuid;

use crate::{app::require_admin, error::ApiError, state::AppState};

pub fn router() -> Router<AppState> {
    Router::new()
        .route(
            "/admin/platform/organizations/:organization_id/orders",
            post(create_order),
        )
        .route("/admin/platform/orders/:order_id", get(get_order))
        .route(
            "/admin/platform/orders/:order_id/payment-attempts",
            post(create_payment_attempt),
        )
        .route(
            "/admin/platform/payment-attempts/:payment_attempt_id/events",
            post(record_payment_event),
        )
}

#[derive(Debug, Clone, Serialize, FromRow)]
pub struct OrderRecord {
    pub id: Uuid,
    pub organization_id: Uuid,
    pub buyer_user_id: Uuid,
    pub status: String,
    pub environment: String,
    pub idempotency_key: String,
    pub request_sha256: String,
    pub amount_minor: i64,
    pub asset_code: String,
    pub asset_scale: i16,
    pub asset_issuer: Option<String>,
    pub expires_at: Option<OffsetDateTime>,
    pub created_at: OffsetDateTime,
    pub updated_at: OffsetDateTime,
}

#[derive(Debug, Clone, Serialize, FromRow)]
pub struct OrderItemRecord {
    pub id: Uuid,
    pub order_id: Uuid,
    pub product_id: Uuid,
    pub product_name: String,
    pub quantity: i64,
    pub unit_amount_minor: i64,
    pub total_amount_minor: i64,
    pub asset_code: String,
    pub asset_scale: i16,
    pub asset_issuer: Option<String>,
    pub created_at: OffsetDateTime,
}

#[derive(Debug, Clone, Serialize, FromRow)]
pub struct PaymentAttemptRecord {
    pub id: Uuid,
    pub order_id: Uuid,
    pub provider: String,
    pub provider_reference: Option<String>,
    pub payer_account: Option<String>,
    pub expected_amount_minor: i64,
    pub asset_code: String,
    pub asset_scale: i16,
    pub asset_issuer: Option<String>,
    pub environment: String,
    pub status: String,
    pub failure_code: Option<String>,
    pub confirmed_at: Option<OffsetDateTime>,
    pub created_at: OffsetDateTime,
    pub updated_at: OffsetDateTime,
}

#[derive(Debug, Clone, Serialize, FromRow)]
pub struct PaymentProviderEventRecord {
    pub id: Uuid,
    pub payment_attempt_id: Uuid,
    pub provider: String,
    pub provider_event_id: String,
    pub payload_sha256: String,
    pub signature_verified: bool,
    pub outcome: String,
    pub amount_minor: i64,
    pub asset_code: String,
    pub asset_scale: i16,
    pub asset_issuer: Option<String>,
    pub payer_account: Option<String>,
    pub environment: String,
    pub processing_status: String,
    pub reconciliation_error: Option<String>,
    pub processed_at: OffsetDateTime,
    pub created_at: OffsetDateTime,
}

#[derive(Debug, Clone, Serialize, FromRow)]
pub struct RefundRecord {
    pub id: Uuid,
    pub order_id: Uuid,
    pub payment_attempt_id: Option<Uuid>,
    pub amount_minor: i64,
    pub asset_code: String,
    pub asset_scale: i16,
    pub asset_issuer: Option<String>,
    pub reason: String,
    pub status: String,
    pub provider_reference: Option<String>,
    pub stellar_transaction_hash: Option<String>,
    pub created_at: OffsetDateTime,
    pub updated_at: OffsetDateTime,
}

#[derive(Debug, Clone, Serialize)]
pub struct OrderDetailResponse {
    pub order: OrderRecord,
    pub items: Vec<OrderItemRecord>,
    pub payment_attempts: Vec<PaymentAttemptRecord>,
    pub payment_events: Vec<PaymentProviderEventRecord>,
    pub refunds: Vec<RefundRecord>,
}

#[derive(Debug, Deserialize)]
pub struct CreateOrderRequest {
    pub product_id: Uuid,
    pub price_id: Uuid,
    pub quantity: i64,
    pub environment: String,
    pub idempotency_key: String,
}

#[derive(Debug, Deserialize)]
pub struct CreatePaymentAttemptRequest {
    pub provider: String,
    pub provider_reference: Option<String>,
    pub payer_account: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct RecordPaymentEventRequest {
    pub provider_event_id: String,
    pub signature_verified: bool,
    pub outcome: String,
    pub amount_minor: i64,
    pub asset_code: String,
    pub asset_scale: i16,
    pub asset_issuer: Option<String>,
    pub payer_account: Option<String>,
    pub environment: String,
    pub payload: Value,
}

async fn create_order(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(organization_id): Path<Uuid>,
    Json(body): Json<CreateOrderRequest>,
) -> Result<(StatusCode, Json<OrderDetailResponse>), ApiError> {
    let actor_user_id = require_admin_actor(&state, &headers)?;
    let pool = database_pool(&state)?;
    require_organization_editor(pool, organization_id, actor_user_id).await?;

    if body.quantity <= 0 {
        return Err(ApiError::InvalidRequest("invalid_order_quantity"));
    }
    let environment = validate_environment(body.environment)?;
    let idempotency_key =
        required_text(body.idempotency_key, 200, "invalid_order_idempotency_key")?;
    let request_sha256 = hash_text(&format!(
        "buyer={actor_user_id};organization={organization_id};product={};price={};quantity={};environment={environment}",
        body.product_id, body.price_id, body.quantity
    ));

    let mut tx = pool.begin().await.map_err(map_database_error)?;
    if let Some((existing_id, existing_hash)) = sqlx::query_as::<_, (Uuid, String)>(
        "SELECT id, request_sha256 FROM orders WHERE organization_id = $1 AND idempotency_key = $2 FOR UPDATE",
    )
    .bind(organization_id)
    .bind(&idempotency_key)
    .fetch_optional(&mut *tx)
    .await
    .map_err(map_database_error)?
    {
        if existing_hash != request_sha256 {
            return Err(ApiError::Conflict("idempotency_key_reused"));
        }
        tx.commit().await.map_err(map_database_error)?;
        return Ok((StatusCode::OK, Json(load_order(pool, existing_id).await?)));
    }

    let catalogue = sqlx::query_as::<
        _,
        (
            Uuid,
            String,
            String,
            i64,
            String,
            i16,
            Option<String>,
            Option<i64>,
            i64,
            i64,
        ),
    >(
        "SELECT p.organization_id, p.name, p.status, pp.amount_minor, pp.asset_code, pp.asset_scale, pp.asset_issuer, i.supply_limit, i.reserved_quantity, i.fulfilled_quantity FROM products p JOIN product_prices pp ON pp.product_id = p.id JOIN product_inventory i ON i.product_id = p.id WHERE p.id = $1 AND pp.id = $2 AND pp.is_active = true AND (pp.starts_at IS NULL OR pp.starts_at <= now()) AND (pp.ends_at IS NULL OR pp.ends_at >= now()) FOR UPDATE OF p, pp, i",
    )
    .bind(body.product_id)
    .bind(body.price_id)
    .fetch_optional(&mut *tx)
    .await
    .map_err(map_database_error)?
    .ok_or(ApiError::InvalidRequest("product_or_price_not_available"))?;

    if catalogue.0 != organization_id {
        return Err(ApiError::Forbidden);
    }
    if catalogue.2 != "published" {
        return Err(ApiError::Conflict("product_not_published"));
    }

    let total_amount_minor = catalogue
        .3
        .checked_mul(body.quantity)
        .ok_or(ApiError::InvalidRequest("order_amount_overflow"))?;
    if catalogue
        .7
        .is_some_and(|limit| catalogue.8 + catalogue.9 + body.quantity > limit)
    {
        return Err(ApiError::Conflict("insufficient_inventory"));
    }

    let order_id = Uuid::new_v4();
    sqlx::query(
        "INSERT INTO orders (id, organization_id, buyer_user_id, status, environment, idempotency_key, request_sha256, amount_minor, asset_code, asset_scale, asset_issuer) VALUES ($1, $2, $3, 'awaiting_payment', $4, $5, $6, $7, $8, $9, $10)",
    )
    .bind(order_id)
    .bind(organization_id)
    .bind(actor_user_id)
    .bind(&environment)
    .bind(&idempotency_key)
    .bind(&request_sha256)
    .bind(total_amount_minor)
    .bind(&catalogue.4)
    .bind(catalogue.5)
    .bind(&catalogue.6)
    .execute(&mut *tx)
    .await
    .map_err(map_database_error)?;

    sqlx::query(
        "INSERT INTO order_items (id, order_id, product_id, product_name, quantity, unit_amount_minor, total_amount_minor, asset_code, asset_scale, asset_issuer) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)",
    )
    .bind(Uuid::new_v4())
    .bind(order_id)
    .bind(body.product_id)
    .bind(&catalogue.1)
    .bind(body.quantity)
    .bind(catalogue.3)
    .bind(total_amount_minor)
    .bind(&catalogue.4)
    .bind(catalogue.5)
    .bind(&catalogue.6)
    .execute(&mut *tx)
    .await
    .map_err(map_database_error)?;

    let updated = sqlx::query(
        "UPDATE product_inventory SET reserved_quantity = reserved_quantity + $2, updated_at = now() WHERE product_id = $1 AND (supply_limit IS NULL OR reserved_quantity + fulfilled_quantity + $2 <= supply_limit)",
    )
    .bind(body.product_id)
    .bind(body.quantity)
    .execute(&mut *tx)
    .await
    .map_err(map_database_error)?;
    if updated.rows_affected() != 1 {
        return Err(ApiError::Conflict("insufficient_inventory"));
    }

    write_audit(
        &mut tx,
        organization_id,
        actor_user_id,
        "order.create",
        "order",
        order_id,
        serde_json::json!({
            "product_id": body.product_id,
            "price_id": body.price_id,
            "quantity": body.quantity,
            "amount_minor": total_amount_minor,
            "asset_code": catalogue.4,
            "environment": environment,
        }),
    )
    .await?;
    tx.commit().await.map_err(map_database_error)?;

    Ok((StatusCode::CREATED, Json(load_order(pool, order_id).await?)))
}

async fn get_order(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(order_id): Path<Uuid>,
) -> Result<Json<OrderDetailResponse>, ApiError> {
    let actor_user_id = require_admin_actor(&state, &headers)?;
    let pool = database_pool(&state)?;
    let organization_id =
        sqlx::query_scalar::<_, Uuid>("SELECT organization_id FROM orders WHERE id = $1")
            .bind(order_id)
            .fetch_optional(pool)
            .await
            .map_err(map_database_error)?
            .ok_or(ApiError::NotFound)?;
    require_organization_editor(pool, organization_id, actor_user_id).await?;
    Ok(Json(load_order(pool, order_id).await?))
}

async fn create_payment_attempt(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(order_id): Path<Uuid>,
    Json(body): Json<CreatePaymentAttemptRequest>,
) -> Result<(StatusCode, Json<PaymentAttemptRecord>), ApiError> {
    let actor_user_id = require_admin_actor(&state, &headers)?;
    let pool = database_pool(&state)?;
    let provider =
        required_text(body.provider, 80, "invalid_payment_provider")?.to_ascii_lowercase();
    let provider_reference =
        optional_text(body.provider_reference, 200, "invalid_provider_reference")?;
    let payer_account = validate_optional_stellar_account(body.payer_account)?;
    let mut tx = pool.begin().await.map_err(map_database_error)?;

    let order = sqlx::query_as::<
        _,
        (Uuid, String, i64, String, i16, Option<String>, String),
    >(
        "SELECT organization_id, status, amount_minor, asset_code, asset_scale, asset_issuer, environment FROM orders WHERE id = $1 FOR UPDATE",
    )
    .bind(order_id)
    .fetch_optional(&mut *tx)
    .await
    .map_err(map_database_error)?
    .ok_or(ApiError::NotFound)?;
    require_organization_editor_tx(&mut tx, order.0, actor_user_id).await?;
    if order.1 != "awaiting_payment" {
        return Err(ApiError::Conflict("order_not_awaiting_payment"));
    }

    let attempt_id = Uuid::new_v4();
    let attempt = sqlx::query_as::<_, PaymentAttemptRecord>(
        "INSERT INTO payment_attempts (id, order_id, provider, provider_reference, payer_account, expected_amount_minor, asset_code, asset_scale, asset_issuer, environment, status) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'awaiting_confirmation') RETURNING id, order_id, provider, provider_reference, payer_account, expected_amount_minor, asset_code, asset_scale, asset_issuer, environment, status, failure_code, confirmed_at, created_at, updated_at",
    )
    .bind(attempt_id)
    .bind(order_id)
    .bind(&provider)
    .bind(provider_reference)
    .bind(payer_account)
    .bind(order.2)
    .bind(&order.3)
    .bind(order.4)
    .bind(&order.5)
    .bind(&order.6)
    .fetch_one(&mut *tx)
    .await
    .map_err(map_database_error)?;

    write_audit(
        &mut tx,
        order.0,
        actor_user_id,
        "payment_attempt.create",
        "payment_attempt",
        attempt_id,
        serde_json::json!({
            "order_id": order_id,
            "provider": provider,
        }),
    )
    .await?;
    tx.commit().await.map_err(map_database_error)?;
    Ok((StatusCode::CREATED, Json(attempt)))
}

async fn record_payment_event(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(payment_attempt_id): Path<Uuid>,
    Json(body): Json<RecordPaymentEventRequest>,
) -> Result<(StatusCode, Json<PaymentProviderEventRecord>), ApiError> {
    let actor_user_id = require_admin_actor(&state, &headers)?;
    if !body.signature_verified {
        return Err(ApiError::Unauthorized);
    }
    if body.amount_minor <= 0 || !(0..=7).contains(&body.asset_scale) {
        return Err(ApiError::InvalidRequest("invalid_payment_event_amount"));
    }

    let pool = database_pool(&state)?;
    let provider_event_id =
        required_text(body.provider_event_id, 200, "invalid_provider_event_id")?;
    let outcome = validate_payment_outcome(body.outcome)?;
    let environment = validate_environment(body.environment)?;
    let asset_code = validate_asset_code(body.asset_code)?;
    let asset_issuer = validate_asset_issuer(&asset_code, body.asset_issuer)?;
    let payer_account = validate_optional_stellar_account(body.payer_account)?;
    let payload_sha256 = payment_event_hash(
        &provider_event_id,
        &outcome,
        body.amount_minor,
        &asset_code,
        body.asset_scale,
        asset_issuer.as_deref(),
        payer_account.as_deref(),
        &environment,
        &body.payload,
    )?;

    let mut tx = pool.begin().await.map_err(map_database_error)?;
    let attempt = sqlx::query_as::<
        _,
        (
            Uuid,
            Uuid,
            String,
            String,
            i64,
            String,
            i16,
            Option<String>,
            Option<String>,
            String,
        ),
    >(
        "SELECT pa.order_id, o.organization_id, pa.provider, pa.status, pa.expected_amount_minor, pa.asset_code, pa.asset_scale, pa.asset_issuer, pa.payer_account, pa.environment FROM payment_attempts pa JOIN orders o ON o.id = pa.order_id WHERE pa.id = $1 FOR UPDATE OF pa, o",
    )
    .bind(payment_attempt_id)
    .fetch_optional(&mut *tx)
    .await
    .map_err(map_database_error)?
    .ok_or(ApiError::NotFound)?;
    require_organization_editor_tx(&mut tx, attempt.1, actor_user_id).await?;

    if let Some(existing) = sqlx::query_as::<_, PaymentProviderEventRecord>(
        "SELECT id, payment_attempt_id, provider, provider_event_id, payload_sha256, signature_verified, outcome, amount_minor, asset_code, asset_scale, asset_issuer, payer_account, environment, processing_status, reconciliation_error, processed_at, created_at FROM payment_provider_events WHERE provider = $1 AND provider_event_id = $2",
    )
    .bind(&attempt.2)
    .bind(&provider_event_id)
    .fetch_optional(&mut *tx)
    .await
    .map_err(map_database_error)?
    {
        if existing.payment_attempt_id != payment_attempt_id
            || existing.payload_sha256 != payload_sha256
        {
            return Err(ApiError::Conflict("provider_event_reused"));
        }
        tx.commit().await.map_err(map_database_error)?;
        return Ok((StatusCode::OK, Json(existing)));
    }

    if !matches!(attempt.3.as_str(), "created" | "awaiting_confirmation") {
        return Err(ApiError::Conflict("payment_attempt_not_active"));
    }

    let reconciliation_error = reconcile_event(
        attempt.4,
        &attempt.5,
        attempt.6,
        attempt.7.as_deref(),
        attempt.8.as_deref(),
        &attempt.9,
        body.amount_minor,
        &asset_code,
        body.asset_scale,
        asset_issuer.as_deref(),
        payer_account.as_deref(),
        &environment,
    );
    let processing_status = if reconciliation_error.is_some() {
        "rejected"
    } else {
        "processed"
    };
    let event_id = Uuid::new_v4();
    let event = sqlx::query_as::<_, PaymentProviderEventRecord>(
        "INSERT INTO payment_provider_events (id, payment_attempt_id, provider, provider_event_id, payload_sha256, signature_verified, outcome, amount_minor, asset_code, asset_scale, asset_issuer, payer_account, environment, processing_status, reconciliation_error) VALUES ($1, $2, $3, $4, $5, true, $6, $7, $8, $9, $10, $11, $12, $13, $14) RETURNING id, payment_attempt_id, provider, provider_event_id, payload_sha256, signature_verified, outcome, amount_minor, asset_code, asset_scale, asset_issuer, payer_account, environment, processing_status, reconciliation_error, processed_at, created_at",
    )
    .bind(event_id)
    .bind(payment_attempt_id)
    .bind(&attempt.2)
    .bind(&provider_event_id)
    .bind(&payload_sha256)
    .bind(&outcome)
    .bind(body.amount_minor)
    .bind(&asset_code)
    .bind(body.asset_scale)
    .bind(&asset_issuer)
    .bind(&payer_account)
    .bind(&environment)
    .bind(processing_status)
    .bind(&reconciliation_error)
    .fetch_one(&mut *tx)
    .await
    .map_err(map_database_error)?;

    if reconciliation_error.is_none() {
        if outcome == "confirmed" {
            sqlx::query(
                "UPDATE payment_attempts SET status = 'confirmed', confirmed_at = now(), failure_code = NULL, updated_at = now() WHERE id = $1",
            )
            .bind(payment_attempt_id)
            .execute(&mut *tx)
            .await
            .map_err(map_database_error)?;
            sqlx::query(
                "UPDATE orders SET status = 'paid', updated_at = now() WHERE id = $1 AND status = 'awaiting_payment'",
            )
            .bind(attempt.0)
            .execute(&mut *tx)
            .await
            .map_err(map_database_error)?;
        } else {
            sqlx::query(
                "UPDATE payment_attempts SET status = 'failed', failure_code = 'provider_failed', updated_at = now() WHERE id = $1",
            )
            .bind(payment_attempt_id)
            .execute(&mut *tx)
            .await
            .map_err(map_database_error)?;
        }
    }

    write_audit(
        &mut tx,
        attempt.1,
        actor_user_id,
        "payment_provider_event.record",
        "payment_provider_event",
        event_id,
        serde_json::json!({
            "payment_attempt_id": payment_attempt_id,
            "order_id": attempt.0,
            "provider_event_id": provider_event_id,
            "processing_status": processing_status,
            "reconciliation_error": reconciliation_error,
        }),
    )
    .await?;
    tx.commit().await.map_err(map_database_error)?;

    let status = if event.processing_status == "processed" {
        StatusCode::CREATED
    } else {
        StatusCode::CONFLICT
    };
    Ok((status, Json(event)))
}

async fn load_order(pool: &PgPool, order_id: Uuid) -> Result<OrderDetailResponse, ApiError> {
    let order = sqlx::query_as::<_, OrderRecord>(
        "SELECT id, organization_id, buyer_user_id, status, environment, idempotency_key, request_sha256, amount_minor, asset_code, asset_scale, asset_issuer, expires_at, created_at, updated_at FROM orders WHERE id = $1",
    )
    .bind(order_id)
    .fetch_optional(pool)
    .await
    .map_err(map_database_error)?
    .ok_or(ApiError::NotFound)?;
    let items = sqlx::query_as::<_, OrderItemRecord>(
        "SELECT id, order_id, product_id, product_name, quantity, unit_amount_minor, total_amount_minor, asset_code, asset_scale, asset_issuer, created_at FROM order_items WHERE order_id = $1 ORDER BY created_at",
    )
    .bind(order_id)
    .fetch_all(pool)
    .await
    .map_err(map_database_error)?;
    let payment_attempts = sqlx::query_as::<_, PaymentAttemptRecord>(
        "SELECT id, order_id, provider, provider_reference, payer_account, expected_amount_minor, asset_code, asset_scale, asset_issuer, environment, status, failure_code, confirmed_at, created_at, updated_at FROM payment_attempts WHERE order_id = $1 ORDER BY created_at",
    )
    .bind(order_id)
    .fetch_all(pool)
    .await
    .map_err(map_database_error)?;
    let payment_events = sqlx::query_as::<_, PaymentProviderEventRecord>(
        "SELECT pe.id, pe.payment_attempt_id, pe.provider, pe.provider_event_id, pe.payload_sha256, pe.signature_verified, pe.outcome, pe.amount_minor, pe.asset_code, pe.asset_scale, pe.asset_issuer, pe.payer_account, pe.environment, pe.processing_status, pe.reconciliation_error, pe.processed_at, pe.created_at FROM payment_provider_events pe JOIN payment_attempts pa ON pa.id = pe.payment_attempt_id WHERE pa.order_id = $1 ORDER BY pe.created_at",
    )
    .bind(order_id)
    .fetch_all(pool)
    .await
    .map_err(map_database_error)?;
    let refunds = sqlx::query_as::<_, RefundRecord>(
        "SELECT id, order_id, payment_attempt_id, amount_minor, asset_code, asset_scale, asset_issuer, reason, status, provider_reference, stellar_transaction_hash, created_at, updated_at FROM refunds WHERE order_id = $1 ORDER BY created_at",
    )
    .bind(order_id)
    .fetch_all(pool)
    .await
    .map_err(map_database_error)?;

    Ok(OrderDetailResponse {
        order,
        items,
        payment_attempts,
        payment_events,
        refunds,
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

async fn require_organization_editor_tx(
    tx: &mut Transaction<'_, Postgres>,
    organization_id: Uuid,
    user_id: Uuid,
) -> Result<(), ApiError> {
    let allowed = sqlx::query_scalar::<_, bool>(
        "SELECT EXISTS (SELECT 1 FROM organization_members WHERE organization_id = $1 AND user_id = $2 AND status = 'active' AND role IN ('owner', 'admin', 'editor'))",
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

fn validate_environment(value: String) -> Result<String, ApiError> {
    let value = value.trim().to_ascii_lowercase();
    if matches!(
        value.as_str(),
        "local" | "testnet" | "staging" | "production"
    ) {
        Ok(value)
    } else {
        Err(ApiError::InvalidRequest("invalid_environment"))
    }
}

fn validate_payment_outcome(value: String) -> Result<String, ApiError> {
    let value = value.trim().to_ascii_lowercase();
    if matches!(value.as_str(), "confirmed" | "failed") {
        Ok(value)
    } else {
        Err(ApiError::InvalidRequest("invalid_payment_outcome"))
    }
}

fn validate_asset_code(value: String) -> Result<String, ApiError> {
    let value = value.trim().to_ascii_uppercase();
    if value.is_empty()
        || value.len() > 12
        || !value
            .chars()
            .all(|character| character.is_ascii_uppercase() || character.is_ascii_digit())
    {
        Err(ApiError::InvalidRequest("invalid_asset_code"))
    } else {
        Ok(value)
    }
}

fn validate_asset_issuer(
    asset_code: &str,
    value: Option<String>,
) -> Result<Option<String>, ApiError> {
    let value = value
        .map(|issuer| issuer.trim().to_ascii_uppercase())
        .filter(|issuer| !issuer.is_empty());
    if asset_code == "XLM" {
        if value.is_some() {
            return Err(ApiError::InvalidRequest("xlm_must_not_have_issuer"));
        }
        return Ok(None);
    }
    let issuer = value.ok_or(ApiError::InvalidRequest("asset_issuer_required"))?;
    if !is_stellar_account(&issuer) {
        return Err(ApiError::InvalidRequest("invalid_asset_issuer"));
    }
    Ok(Some(issuer))
}

fn validate_optional_stellar_account(value: Option<String>) -> Result<Option<String>, ApiError> {
    value
        .map(|value| {
            let value = value.trim().to_ascii_uppercase();
            if is_stellar_account(&value) {
                Ok(value)
            } else {
                Err(ApiError::InvalidRequest("invalid_stellar_account"))
            }
        })
        .transpose()
}

fn is_stellar_account(value: &str) -> bool {
    value.len() == 56
        && value.starts_with('G')
        && value
            .chars()
            .skip(1)
            .all(|character| character.is_ascii_uppercase() || ('2'..='7').contains(&character))
}

fn reconcile_event(
    expected_amount_minor: i64,
    expected_asset_code: &str,
    expected_asset_scale: i16,
    expected_asset_issuer: Option<&str>,
    expected_payer_account: Option<&str>,
    expected_environment: &str,
    actual_amount_minor: i64,
    actual_asset_code: &str,
    actual_asset_scale: i16,
    actual_asset_issuer: Option<&str>,
    actual_payer_account: Option<&str>,
    actual_environment: &str,
) -> Option<String> {
    if actual_amount_minor != expected_amount_minor {
        return Some("amount_mismatch".to_string());
    }
    if actual_asset_code != expected_asset_code
        || actual_asset_scale != expected_asset_scale
        || actual_asset_issuer != expected_asset_issuer
    {
        return Some("asset_mismatch".to_string());
    }
    if actual_environment != expected_environment {
        return Some("environment_mismatch".to_string());
    }
    if expected_payer_account.is_some() && actual_payer_account != expected_payer_account {
        return Some("payer_mismatch".to_string());
    }
    None
}

fn payment_event_hash(
    provider_event_id: &str,
    outcome: &str,
    amount_minor: i64,
    asset_code: &str,
    asset_scale: i16,
    asset_issuer: Option<&str>,
    payer_account: Option<&str>,
    environment: &str,
    payload: &Value,
) -> Result<String, ApiError> {
    let payload = serde_json::to_vec(payload)
        .map_err(|_| ApiError::InvalidRequest("invalid_payment_event_payload"))?;
    let mut hasher = Sha256::new();
    hasher.update(provider_event_id.as_bytes());
    hasher.update([0]);
    hasher.update(outcome.as_bytes());
    hasher.update([0]);
    hasher.update(amount_minor.to_be_bytes());
    hasher.update(asset_code.as_bytes());
    hasher.update(asset_scale.to_be_bytes());
    hasher.update(asset_issuer.unwrap_or_default().as_bytes());
    hasher.update([0]);
    hasher.update(payer_account.unwrap_or_default().as_bytes());
    hasher.update([0]);
    hasher.update(environment.as_bytes());
    hasher.update([0]);
    hasher.update(payload);
    Ok(hex::encode(hasher.finalize()))
}

fn hash_text(value: &str) -> String {
    hex::encode(Sha256::digest(value.as_bytes()))
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
                tracing::error!(error = %error, "order database operation failed");
                ApiError::Database
            }
        };
    }
    tracing::error!(error = %error, "order database operation failed");
    ApiError::Database
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reconciles_exact_integer_payment() {
        assert_eq!(
            reconcile_event(
                2_500_000, "XLM", 7, None, None, "testnet", 2_500_000, "XLM", 7, None, None,
                "testnet",
            ),
            None
        );
        assert_eq!(
            reconcile_event(
                2_500_000, "XLM", 7, None, None, "testnet", 2_499_999, "XLM", 7, None, None,
                "testnet",
            ),
            Some("amount_mismatch".to_string())
        );
    }

    #[test]
    fn hashes_replayed_events_deterministically() {
        let payload = serde_json::json!({"transaction": "abc"});
        let first = payment_event_hash(
            "event-1",
            "confirmed",
            10,
            "XLM",
            7,
            None,
            None,
            "testnet",
            &payload,
        )
        .unwrap();
        let second = payment_event_hash(
            "event-1",
            "confirmed",
            10,
            "XLM",
            7,
            None,
            None,
            "testnet",
            &payload,
        )
        .unwrap();
        assert_eq!(first, second);
    }
}
