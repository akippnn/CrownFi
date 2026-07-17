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
use time::OffsetDateTime;
use uuid::Uuid;

use crate::{error::ApiError, state::AppState};

pub fn router() -> Router<AppState> {
    Router::new()
        .route(
            "/ticket-operations/orders/:order_id/prepare-issuance",
            post(prepare_issuance),
        )
        .route(
            "/ticket-operations/issuances/:issuance_id/ownership-evidence",
            post(accept_ownership_evidence),
        )
        .route(
            "/ticketing/tokens/:token_id/verify",
            get(verify_ticket_ownership),
        )
        .route(
            "/ticketing/issuances/:issuance_id/check-in",
            post(check_in_ticket),
        )
}

#[derive(Debug, Clone, Serialize, FromRow)]
struct TicketIssuanceRecord {
    id: Uuid,
    organization_id: Uuid,
    ticket_event_id: Uuid,
    ticket_product_id: Uuid,
    order_id: Uuid,
    owner_user_id: Uuid,
    owner_stellar_account_id: Uuid,
    serial_number: i64,
    status: String,
    token_id: Option<String>,
    issuance_tx_hash: Option<String>,
    accepted_evidence_id: Option<Uuid>,
    issued_at: Option<OffsetDateTime>,
    created_at: OffsetDateTime,
    updated_at: OffsetDateTime,
}

#[derive(Debug, Clone, FromRow)]
struct PaidOrderContext {
    organization_id: Uuid,
    buyer_user_id: Uuid,
    order_status: String,
    reservation_id: Uuid,
    reservation_status: String,
    ticket_product_id: Uuid,
    ticket_event_id: Uuid,
    product_id: Uuid,
    quantity: i64,
}

#[derive(Debug, Deserialize)]
struct OwnershipEvidenceRequest {
    token_id: String,
    transaction_hash: String,
    ledger_sequence: i64,
    contract_event_id: String,
    owner_address: String,
    #[serde(default)]
    evidence: Value,
}

#[derive(Debug, Clone, Serialize, FromRow)]
struct TicketOwnershipView {
    issuance_id: Uuid,
    organization_id: Uuid,
    ticket_event_id: Uuid,
    ticket_product_id: Uuid,
    token_id: String,
    owner_address: String,
    transaction_hash: String,
    ledger_sequence: i64,
    contract_event_id: String,
    accepted_at: OffsetDateTime,
    issuance_status: String,
    serial_number: i64,
}

#[derive(Debug, Deserialize)]
struct CheckInRequest {
    nonce: String,
    device_reference: Option<String>,
    #[serde(default)]
    metadata: Value,
}

#[derive(Debug, Clone, Serialize, FromRow)]
struct TicketCheckInRecord {
    id: Uuid,
    ticket_issuance_id: Uuid,
    ticket_event_id: Uuid,
    checked_in_by_user_id: Uuid,
    device_reference: Option<String>,
    checked_in_at: OffsetDateTime,
    metadata: Value,
}

async fn prepare_issuance(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(order_id): Path<Uuid>,
) -> Result<(StatusCode, Json<Vec<TicketIssuanceRecord>>), ApiError> {
    require_fulfillment_worker(&state, &headers)?;
    let pool = database_pool(&state)?;
    let mut tx = pool.begin().await.map_err(map_database_error)?;

    let context = sqlx::query_as::<_, PaidOrderContext>(
        "SELECT o.organization_id, o.buyer_user_id, o.status AS order_status, tr.id AS reservation_id, tr.status AS reservation_status, tr.ticket_product_id, tp.ticket_event_id, tp.product_id, tr.quantity FROM orders o JOIN ticket_reservations tr ON tr.order_id = o.id JOIN ticket_products tp ON tp.id = tr.ticket_product_id WHERE o.id = $1 FOR UPDATE OF o, tr, tp",
    )
    .bind(order_id)
    .fetch_optional(&mut *tx)
    .await
    .map_err(map_database_error)?
    .ok_or(ApiError::NotFound)?;

    if let Some(existing) = load_issuances_tx(&mut tx, order_id).await? {
        tx.commit().await.map_err(map_database_error)?;
        return Ok((StatusCode::OK, Json(existing)));
    }
    if context.order_status != "paid" || context.reservation_status != "reserved" {
        return Err(ApiError::Conflict("ticket_order_not_ready_for_issuance"));
    }

    let accepted_payment = sqlx::query_scalar::<_, bool>(
        "SELECT EXISTS (SELECT 1 FROM transaction_intents ti JOIN stellar_reconciliation_results rr ON rr.transaction_intent_id = ti.id AND rr.status = 'accepted' WHERE ti.order_id = $1)",
    )
    .bind(order_id)
    .fetch_one(&mut *tx)
    .await
    .map_err(map_database_error)?;
    if !accepted_payment {
        return Err(ApiError::Conflict("ticket_payment_evidence_missing"));
    }

    let owner_stellar_account_id = sqlx::query_scalar::<_, Uuid>(
        "SELECT id FROM stellar_accounts WHERE user_id = $1 AND network = 'testnet' AND verified_at IS NOT NULL ORDER BY is_primary DESC, created_at, id LIMIT 1",
    )
    .bind(context.buyer_user_id)
    .fetch_optional(&mut *tx)
    .await
    .map_err(map_database_error)?
    .ok_or(ApiError::Conflict("ticket_owner_wallet_missing"))?;

    sqlx::query("SELECT id FROM ticket_events WHERE id = $1 FOR UPDATE")
        .bind(context.ticket_event_id)
        .execute(&mut *tx)
        .await
        .map_err(map_database_error)?;
    let current_serial = sqlx::query_scalar::<_, i64>(
        "SELECT COALESCE(MAX(serial_number),0)::BIGINT FROM ticket_issuances WHERE ticket_event_id = $1",
    )
    .bind(context.ticket_event_id)
    .fetch_one(&mut *tx)
    .await
    .map_err(map_database_error)?;

    for offset in 1..=context.quantity {
        let serial_number = current_serial
            .checked_add(offset)
            .ok_or(ApiError::InvalidRequest("ticket_serial_overflow"))?;
        sqlx::query(
            "INSERT INTO ticket_issuances (id, organization_id, ticket_event_id, ticket_product_id, order_id, owner_user_id, owner_stellar_account_id, serial_number, status) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'pending')",
        )
        .bind(Uuid::new_v4())
        .bind(context.organization_id)
        .bind(context.ticket_event_id)
        .bind(context.ticket_product_id)
        .bind(order_id)
        .bind(context.buyer_user_id)
        .bind(owner_stellar_account_id)
        .bind(serial_number)
        .execute(&mut *tx)
        .await
        .map_err(map_database_error)?;
    }

    let inventory_updated = sqlx::query(
        "UPDATE product_inventory SET reserved_quantity = reserved_quantity - $2, fulfilled_quantity = fulfilled_quantity + $2, updated_at = now() WHERE product_id = $1 AND reserved_quantity >= $2",
    )
    .bind(context.product_id)
    .bind(context.quantity)
    .execute(&mut *tx)
    .await
    .map_err(map_database_error)?;
    if inventory_updated.rows_affected() != 1 {
        return Err(ApiError::Conflict("ticket_inventory_projection_drift"));
    }
    sqlx::query(
        "UPDATE ticket_reservations SET status = 'converted', converted_at = now(), updated_at = now() WHERE id = $1 AND status = 'reserved'",
    )
    .bind(context.reservation_id)
    .execute(&mut *tx)
    .await
    .map_err(map_database_error)?;
    sqlx::query(
        "UPDATE orders SET status = 'fulfilling', updated_at = now() WHERE id = $1 AND status = 'paid'",
    )
    .bind(order_id)
    .execute(&mut *tx)
    .await
    .map_err(map_database_error)?;
    write_audit(
        &mut tx,
        context.organization_id,
        None,
        "ticket_issuance.prepare",
        "order",
        order_id,
        json!({
            "reservation_id": context.reservation_id,
            "ticket_product_id": context.ticket_product_id,
            "quantity": context.quantity,
            "owner_stellar_account_id": owner_stellar_account_id,
        }),
    )
    .await?;
    let records = load_issuances_tx_required(&mut tx, order_id).await?;
    tx.commit().await.map_err(map_database_error)?;
    Ok((StatusCode::CREATED, Json(records)))
}

async fn accept_ownership_evidence(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(issuance_id): Path<Uuid>,
    Json(body): Json<OwnershipEvidenceRequest>,
) -> Result<(StatusCode, Json<TicketOwnershipView>), ApiError> {
    require_fulfillment_worker(&state, &headers)?;
    let pool = database_pool(&state)?;
    let token_id = required_text(body.token_id, 240, "invalid_ticket_token_id")?;
    let transaction_hash = validate_hash(body.transaction_hash, "invalid_ticket_transaction_hash")?;
    let contract_event_id = required_text(
        body.contract_event_id,
        240,
        "invalid_ticket_contract_event_id",
    )?;
    let owner_address = validate_stellar_address(body.owner_address)?;
    if body.ledger_sequence <= 0 || !body.evidence.is_object() {
        return Err(ApiError::InvalidRequest(
            "invalid_ticket_ownership_evidence",
        ));
    }

    let mut tx = pool.begin().await.map_err(map_database_error)?;
    let issuance = sqlx::query_as::<_, TicketIssuanceRecord>(
        "SELECT id, organization_id, ticket_event_id, ticket_product_id, order_id, owner_user_id, owner_stellar_account_id, serial_number, status, token_id, issuance_tx_hash, accepted_evidence_id, issued_at, created_at, updated_at FROM ticket_issuances WHERE id = $1 FOR UPDATE",
    )
    .bind(issuance_id)
    .fetch_optional(&mut *tx)
    .await
    .map_err(map_database_error)?
    .ok_or(ApiError::NotFound)?;

    if let Some(existing) = load_ownership_tx(&mut tx, issuance_id).await? {
        if existing.token_id != token_id || existing.transaction_hash != transaction_hash {
            return Err(ApiError::Conflict("ticket_ownership_evidence_conflict"));
        }
        tx.commit().await.map_err(map_database_error)?;
        return Ok((StatusCode::OK, Json(existing)));
    }
    if !matches!(issuance.status.as_str(), "pending" | "submitted") {
        return Err(ApiError::Conflict("ticket_issuance_not_evidence_ready"));
    }

    let expected_owner = sqlx::query_scalar::<_, String>(
        "SELECT address FROM stellar_accounts WHERE id = $1 AND network = 'testnet' AND verified_at IS NOT NULL",
    )
    .bind(issuance.owner_stellar_account_id)
    .fetch_optional(&mut *tx)
    .await
    .map_err(map_database_error)?
    .ok_or(ApiError::Conflict("ticket_owner_wallet_missing"))?;
    if expected_owner != owner_address {
        return Err(ApiError::Conflict("ticket_ownership_owner_mismatch"));
    }

    let evidence_id = Uuid::new_v4();
    let accepted_at = OffsetDateTime::now_utc();
    sqlx::query(
        "INSERT INTO ticket_ownership_evidence (id, organization_id, ticket_issuance_id, owner_stellar_account_id, token_id, transaction_hash, ledger_sequence, contract_event_id, evidence_json, accepted_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)",
    )
    .bind(evidence_id)
    .bind(issuance.organization_id)
    .bind(issuance_id)
    .bind(issuance.owner_stellar_account_id)
    .bind(&token_id)
    .bind(&transaction_hash)
    .bind(body.ledger_sequence)
    .bind(&contract_event_id)
    .bind(&body.evidence)
    .bind(accepted_at)
    .execute(&mut *tx)
    .await
    .map_err(map_database_error)?;
    sqlx::query(
        "UPDATE ticket_issuances SET status = 'issued', token_id = $2, issuance_tx_hash = $3, accepted_evidence_id = $4, issued_at = $5, updated_at = now() WHERE id = $1",
    )
    .bind(issuance_id)
    .bind(&token_id)
    .bind(&transaction_hash)
    .bind(evidence_id)
    .bind(accepted_at)
    .execute(&mut *tx)
    .await
    .map_err(map_database_error)?;

    let remaining = sqlx::query_scalar::<_, i64>(
        "SELECT COUNT(*)::BIGINT FROM ticket_issuances WHERE order_id = $1 AND status <> 'issued'",
    )
    .bind(issuance.order_id)
    .fetch_one(&mut *tx)
    .await
    .map_err(map_database_error)?;
    if remaining == 0 {
        sqlx::query(
            "UPDATE orders SET status = 'fulfilled', updated_at = now() WHERE id = $1 AND status = 'fulfilling'",
        )
        .bind(issuance.order_id)
        .execute(&mut *tx)
        .await
        .map_err(map_database_error)?;
    }
    write_audit(
        &mut tx,
        issuance.organization_id,
        None,
        "ticket_ownership.accept",
        "ticket_issuance",
        issuance_id,
        json!({
            "evidence_id": evidence_id,
            "token_id": token_id,
            "transaction_hash": transaction_hash,
            "ledger_sequence": body.ledger_sequence,
            "contract_event_id": contract_event_id,
        }),
    )
    .await?;
    let view = load_ownership_tx(&mut tx, issuance_id)
        .await?
        .ok_or(ApiError::NotFound)?;
    tx.commit().await.map_err(map_database_error)?;
    Ok((StatusCode::CREATED, Json(view)))
}

async fn verify_ticket_ownership(
    State(state): State<AppState>,
    Path(token_id): Path<String>,
) -> Result<Json<TicketOwnershipView>, ApiError> {
    let token_id = required_text(token_id, 240, "invalid_ticket_token_id")?;
    let record = sqlx::query_as::<_, TicketOwnershipView>(
        "SELECT ti.id AS issuance_id, ti.organization_id, ti.ticket_event_id, ti.ticket_product_id, toe.token_id, sa.address AS owner_address, toe.transaction_hash, toe.ledger_sequence, toe.contract_event_id, toe.accepted_at, ti.status AS issuance_status, ti.serial_number FROM ticket_ownership_evidence toe JOIN ticket_issuances ti ON ti.id = toe.ticket_issuance_id AND ti.accepted_evidence_id = toe.id JOIN stellar_accounts sa ON sa.id = toe.owner_stellar_account_id WHERE toe.token_id = $1 AND ti.status = 'issued'",
    )
    .bind(token_id)
    .fetch_optional(database_pool(&state)?)
    .await
    .map_err(map_database_error)?
    .ok_or(ApiError::NotFound)?;
    Ok(Json(record))
}

async fn check_in_ticket(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(issuance_id): Path<Uuid>,
    Json(body): Json<CheckInRequest>,
) -> Result<(StatusCode, Json<TicketCheckInRecord>), ApiError> {
    let actor_user_id = require_web_actor(&state, &headers)?;
    let nonce = required_text(body.nonce, 500, "invalid_ticket_check_in_nonce")?;
    let device_reference =
        optional_text(body.device_reference, 240, "invalid_ticket_check_in_device")?;
    if !body.metadata.is_object() {
        return Err(ApiError::InvalidRequest("invalid_ticket_check_in_metadata"));
    }
    let nonce_hash = hash_text(&format!("crownfi-ticket-check-in-v1|{issuance_id}|{nonce}"));
    let pool = database_pool(&state)?;
    let mut tx = pool.begin().await.map_err(map_database_error)?;
    let issuance = sqlx::query_as::<_, (Uuid, Uuid, String, Option<Uuid>)>(
        "SELECT organization_id, ticket_event_id, status, accepted_evidence_id FROM ticket_issuances WHERE id = $1 FOR UPDATE",
    )
    .bind(issuance_id)
    .fetch_optional(&mut *tx)
    .await
    .map_err(map_database_error)?
    .ok_or(ApiError::NotFound)?;
    require_organization_operator_tx(&mut tx, issuance.0, actor_user_id).await?;
    if issuance.2 != "issued" || issuance.3.is_none() {
        return Err(ApiError::Conflict("ticket_not_issued"));
    }
    let event_valid = sqlx::query_scalar::<_, bool>(
        "SELECT EXISTS (SELECT 1 FROM ticket_events WHERE id = $1 AND status NOT IN ('cancelled','archived'))",
    )
    .bind(issuance.1)
    .fetch_one(&mut *tx)
    .await
    .map_err(map_database_error)?;
    if !event_valid {
        return Err(ApiError::Conflict("ticket_event_not_check_in_ready"));
    }
    if let Some(existing) = sqlx::query_as::<_, TicketCheckInRecord>(
        "SELECT id, ticket_issuance_id, ticket_event_id, checked_in_by_user_id, device_reference, checked_in_at, metadata FROM ticket_check_ins WHERE ticket_issuance_id = $1 FOR UPDATE",
    )
    .bind(issuance_id)
    .fetch_optional(&mut *tx)
    .await
    .map_err(map_database_error)?
    {
        return Err(ApiError::Conflict(if existing.checked_in_by_user_id == actor_user_id {
            "ticket_already_checked_in"
        } else {
            "ticket_check_in_replay"
        }));
    }

    let check_in_id = Uuid::new_v4();
    sqlx::query(
        "INSERT INTO ticket_check_ins (id, ticket_issuance_id, ticket_event_id, checked_in_by_user_id, check_in_nonce_hash, device_reference, metadata) VALUES ($1,$2,$3,$4,$5,$6,$7)",
    )
    .bind(check_in_id)
    .bind(issuance_id)
    .bind(issuance.1)
    .bind(actor_user_id)
    .bind(&nonce_hash)
    .bind(&device_reference)
    .bind(&body.metadata)
    .execute(&mut *tx)
    .await
    .map_err(map_database_error)?;
    write_audit(
        &mut tx,
        issuance.0,
        Some(actor_user_id),
        "ticket_check_in.accept",
        "ticket_issuance",
        issuance_id,
        json!({"check_in_id": check_in_id, "device_reference": device_reference}),
    )
    .await?;
    let record = sqlx::query_as::<_, TicketCheckInRecord>(
        "SELECT id, ticket_issuance_id, ticket_event_id, checked_in_by_user_id, device_reference, checked_in_at, metadata FROM ticket_check_ins WHERE id = $1",
    )
    .bind(check_in_id)
    .fetch_one(&mut *tx)
    .await
    .map_err(map_database_error)?;
    tx.commit().await.map_err(map_database_error)?;
    Ok((StatusCode::CREATED, Json(record)))
}

async fn load_issuances_tx(
    tx: &mut Transaction<'_, Postgres>,
    order_id: Uuid,
) -> Result<Option<Vec<TicketIssuanceRecord>>, ApiError> {
    let rows = load_issuances_tx_required(tx, order_id).await?;
    if rows.is_empty() {
        Ok(None)
    } else {
        Ok(Some(rows))
    }
}

async fn load_issuances_tx_required(
    tx: &mut Transaction<'_, Postgres>,
    order_id: Uuid,
) -> Result<Vec<TicketIssuanceRecord>, ApiError> {
    sqlx::query_as::<_, TicketIssuanceRecord>(
        "SELECT id, organization_id, ticket_event_id, ticket_product_id, order_id, owner_user_id, owner_stellar_account_id, serial_number, status, token_id, issuance_tx_hash, accepted_evidence_id, issued_at, created_at, updated_at FROM ticket_issuances WHERE order_id = $1 ORDER BY serial_number, id",
    )
    .bind(order_id)
    .fetch_all(&mut **tx)
    .await
    .map_err(map_database_error)
}

async fn load_ownership_tx(
    tx: &mut Transaction<'_, Postgres>,
    issuance_id: Uuid,
) -> Result<Option<TicketOwnershipView>, ApiError> {
    sqlx::query_as::<_, TicketOwnershipView>(
        "SELECT ti.id AS issuance_id, ti.organization_id, ti.ticket_event_id, ti.ticket_product_id, toe.token_id, sa.address AS owner_address, toe.transaction_hash, toe.ledger_sequence, toe.contract_event_id, toe.accepted_at, ti.status AS issuance_status, ti.serial_number FROM ticket_ownership_evidence toe JOIN ticket_issuances ti ON ti.id = toe.ticket_issuance_id AND ti.accepted_evidence_id = toe.id JOIN stellar_accounts sa ON sa.id = toe.owner_stellar_account_id WHERE ti.id = $1",
    )
    .bind(issuance_id)
    .fetch_optional(&mut **tx)
    .await
    .map_err(map_database_error)
}

async fn write_audit(
    tx: &mut Transaction<'_, Postgres>,
    organization_id: Uuid,
    actor_user_id: Option<Uuid>,
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

fn require_fulfillment_worker(state: &AppState, headers: &HeaderMap) -> Result<(), ApiError> {
    let provided = headers
        .get("x-crownfi-payout-worker-token")
        .and_then(|value| value.to_str().ok())
        .unwrap_or_default();
    match state.config.payout_worker_token.as_deref() {
        Some(expected) if !expected.is_empty() && provided == expected => Ok(()),
        _ => Err(ApiError::Unauthorized),
    }
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

async fn require_organization_operator_tx(
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

fn validate_hash(value: String, code: &'static str) -> Result<String, ApiError> {
    let value = value.trim().to_ascii_lowercase();
    if value.len() == 64 && value.chars().all(|character| character.is_ascii_hexdigit()) {
        Ok(value)
    } else {
        Err(ApiError::InvalidRequest(code))
    }
}

fn validate_stellar_address(value: String) -> Result<String, ApiError> {
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
        Err(ApiError::InvalidRequest("invalid_ticket_owner_address"))
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

fn map_database_error(error: sqlx::Error) -> ApiError {
    if let Some(database_error) = error.as_database_error() {
        let code = database_error.code().map(|code| code.into_owned());
        return match code.as_deref() {
            Some("23505") => ApiError::Conflict("ticket_operation_already_applied"),
            Some("23503") => ApiError::InvalidRequest("ticket_operation_resource_missing"),
            Some("23514") | Some("22P02") => {
                ApiError::InvalidRequest("ticket_operation_constraint_failed")
            }
            _ => {
                tracing::error!(error = %error, "ticket operation database failure");
                ApiError::Database
            }
        };
    }
    tracing::error!(error = %error, "ticket operation database failure");
    ApiError::Database
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn check_in_nonce_hash_is_stable() {
        assert_eq!(
            hash_text("crownfi-ticket-check-in-v1|ticket|nonce"),
            hash_text("crownfi-ticket-check-in-v1|ticket|nonce")
        );
    }

    #[test]
    fn transaction_hashes_are_strict() {
        assert!(validate_hash("a".repeat(64), "bad").is_ok());
        assert!(validate_hash("z".repeat(64), "bad").is_err());
    }
}
