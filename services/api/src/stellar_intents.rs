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
use time::{Duration, OffsetDateTime};
use uuid::Uuid;

use crate::{app::require_admin, error::ApiError, state::AppState};

const TESTNET_NETWORK_PASSPHRASE: &str = "Test SDF Network ; September 2015";
const ENVELOPE_TYPE_TX: i32 = 2;
const KEY_TYPE_ED25519: i32 = 0;
const PRECOND_NONE: i32 = 0;
const PRECOND_TIME: i32 = 1;
const MEMO_NONE: i32 = 0;
const MEMO_TEXT: i32 = 1;
const OPERATION_PAYMENT: i32 = 1;
const ASSET_NATIVE: i32 = 0;
const ASSET_ALPHANUM4: i32 = 1;
const ASSET_ALPHANUM12: i32 = 2;
const BASE64_ALPHABET: &[u8; 64] =
    b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

pub fn router() -> Router<AppState> {
    Router::new()
        .route(
            "/admin/platform/orders/:order_id/stellar-intents",
            post(create_transaction_intent),
        )
        .route(
            "/admin/platform/stellar-intents/:intent_id",
            get(get_transaction_intent),
        )
        .route(
            "/admin/platform/stellar-intents/:intent_id/signed-envelope",
            post(accept_signed_envelope),
        )
}

#[derive(Debug, Clone, Serialize, FromRow)]
pub struct TransactionIntentRecord {
    pub id: Uuid,
    pub organization_id: Uuid,
    pub order_id: Uuid,
    pub payment_attempt_id: Uuid,
    pub created_by_user_id: Uuid,
    pub operation_type: String,
    pub network: String,
    pub source_account: String,
    pub destination_account: String,
    pub transaction_sequence: i64,
    pub base_fee: i32,
    pub amount_minor: i64,
    pub asset_code: String,
    pub asset_scale: i16,
    pub asset_issuer: Option<String>,
    pub memo_text: String,
    pub idempotency_key: String,
    pub request_sha256: String,
    pub transaction_body_sha256: String,
    pub unsigned_envelope_sha256: String,
    pub unsigned_envelope_xdr: String,
    pub status: String,
    pub expires_at: OffsetDateTime,
    pub signed_at: Option<OffsetDateTime>,
    pub submitted_at: Option<OffsetDateTime>,
    pub confirmed_at: Option<OffsetDateTime>,
    pub failure_code: Option<String>,
    pub created_at: OffsetDateTime,
    pub updated_at: OffsetDateTime,
}

#[derive(Debug, Clone, Serialize, FromRow)]
pub struct StellarTransactionRecord {
    pub id: Uuid,
    pub transaction_intent_id: Uuid,
    pub network: String,
    pub envelope_sha256: String,
    pub signed_envelope_xdr: String,
    pub transaction_hash: String,
    pub status: String,
    pub horizon_status_code: Option<i32>,
    pub horizon_response: Option<Value>,
    pub failure_code: Option<String>,
    pub submitted_at: Option<OffsetDateTime>,
    pub confirmed_at: Option<OffsetDateTime>,
    pub created_at: OffsetDateTime,
    pub updated_at: OffsetDateTime,
}

#[derive(Debug, Clone, Serialize)]
pub struct TransactionIntentResponse {
    pub intent: TransactionIntentRecord,
    pub transaction: Option<StellarTransactionRecord>,
}

#[derive(Debug, Deserialize)]
pub struct CreateTransactionIntentRequest {
    pub payment_attempt_id: Uuid,
    pub source_account: String,
    pub destination_account: String,
    pub source_account_sequence: i64,
    pub base_fee: Option<u32>,
    pub timeout_seconds: Option<i64>,
    pub idempotency_key: String,
}

#[derive(Debug, Deserialize)]
pub struct SignedEnvelopeRequest {
    pub signed_envelope_xdr: String,
}

#[derive(Debug)]
struct BuiltEnvelope {
    envelope_xdr: String,
    transaction_body_sha256: String,
    unsigned_envelope_sha256: String,
}

#[derive(Debug)]
struct ParsedEnvelope {
    transaction_body: Vec<u8>,
    source_account: [u8; 32],
    sequence: i64,
    fee: u32,
    max_time: Option<u64>,
    memo_text: Option<String>,
    destination_account: [u8; 32],
    asset_code: String,
    asset_issuer: Option<[u8; 32]>,
    amount: i64,
    signature_count: u32,
}

async fn create_transaction_intent(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(order_id): Path<Uuid>,
    Json(body): Json<CreateTransactionIntentRequest>,
) -> Result<(StatusCode, Json<TransactionIntentResponse>), ApiError> {
    let actor_user_id = require_admin_actor(&state, &headers)?;
    let pool = database_pool(&state)?;

    let source_account = normalize_stellar_account(body.source_account)?;
    let destination_account = normalize_stellar_account(body.destination_account)?;
    if source_account == destination_account {
        return Err(ApiError::InvalidRequest(
            "stellar_source_equals_destination",
        ));
    }
    if body.source_account_sequence < 0 {
        return Err(ApiError::InvalidRequest("invalid_source_account_sequence"));
    }
    let transaction_sequence = body
        .source_account_sequence
        .checked_add(1)
        .ok_or(ApiError::InvalidRequest("transaction_sequence_overflow"))?;
    if transaction_sequence <= 0 {
        return Err(ApiError::InvalidRequest("invalid_transaction_sequence"));
    }

    let base_fee = body.base_fee.unwrap_or(100);
    if !(100..=1_000_000).contains(&base_fee) {
        return Err(ApiError::InvalidRequest("invalid_stellar_base_fee"));
    }
    let timeout_seconds = body.timeout_seconds.unwrap_or(300);
    if !(60..=900).contains(&timeout_seconds) {
        return Err(ApiError::InvalidRequest("invalid_transaction_timeout"));
    }
    let idempotency_key = required_text(
        body.idempotency_key,
        200,
        "invalid_transaction_intent_idempotency_key",
    )?;

    let mut tx = pool.begin().await.map_err(map_database_error)?;
    let payment = sqlx::query_as::<
        _,
        (
            Uuid,
            String,
            String,
            i64,
            String,
            i16,
            Option<String>,
            Uuid,
            String,
            i64,
            String,
            i16,
            Option<String>,
            String,
        ),
    >(
        "SELECT o.organization_id, o.status, o.environment, o.amount_minor, o.asset_code, o.asset_scale, o.asset_issuer, pa.order_id, pa.status, pa.expected_amount_minor, pa.asset_code, pa.asset_scale, pa.asset_issuer, pa.environment FROM payment_attempts pa JOIN orders o ON o.id = pa.order_id WHERE pa.id = $1 FOR UPDATE OF pa, o",
    )
    .bind(body.payment_attempt_id)
    .fetch_optional(&mut *tx)
    .await
    .map_err(map_database_error)?
    .ok_or(ApiError::NotFound)?;

    require_organization_editor_tx(&mut tx, payment.0, actor_user_id).await?;
    if payment.7 != order_id {
        return Err(ApiError::InvalidRequest("payment_attempt_order_mismatch"));
    }
    if payment.1 != "awaiting_payment" {
        return Err(ApiError::Conflict("order_not_awaiting_payment"));
    }
    if !matches!(payment.8.as_str(), "created" | "awaiting_confirmation") {
        return Err(ApiError::Conflict("payment_attempt_not_active"));
    }
    if payment.2 != "testnet" || payment.13 != "testnet" {
        return Err(ApiError::InvalidRequest("stellar_intent_requires_testnet"));
    }
    if payment.3 != payment.9
        || payment.4 != payment.10
        || payment.5 != payment.11
        || payment.6 != payment.12
    {
        return Err(ApiError::Conflict("payment_attempt_snapshot_mismatch"));
    }

    let request_sha256 = hash_text(&format!(
        "organization={};order={order_id};attempt={};source={source_account};destination={destination_account};source_sequence={};base_fee={base_fee};timeout={timeout_seconds};amount={};asset={}:{}:{}",
        payment.0,
        body.payment_attempt_id,
        body.source_account_sequence,
        payment.3,
        payment.4,
        payment.5,
        payment.6.as_deref().unwrap_or_default(),
    ));

    if let Some((existing_id, existing_hash)) = sqlx::query_as::<_, (Uuid, String)>(
        "SELECT id, request_sha256 FROM transaction_intents WHERE organization_id = $1 AND idempotency_key = $2 FOR UPDATE",
    )
    .bind(payment.0)
    .bind(&idempotency_key)
    .fetch_optional(&mut *tx)
    .await
    .map_err(map_database_error)?
    {
        if existing_hash != request_sha256 {
            return Err(ApiError::Conflict("idempotency_key_reused"));
        }
        tx.commit().await.map_err(map_database_error)?;
        return Ok((
            StatusCode::OK,
            Json(load_transaction_intent(pool, existing_id).await?),
        ));
    }

    let intent_id = Uuid::new_v4();
    let simple_id = intent_id.simple().to_string();
    let memo_text = format!("CFI-{}", &simple_id[..20]);
    let expires_at = OffsetDateTime::now_utc() + Duration::seconds(timeout_seconds);
    let built = build_unsigned_payment_envelope(
        &source_account,
        &destination_account,
        transaction_sequence,
        base_fee,
        payment.3,
        &payment.4,
        payment.6.as_deref(),
        &memo_text,
        expires_at.unix_timestamp(),
    )?;

    sqlx::query(
        "INSERT INTO transaction_intents (id, organization_id, order_id, payment_attempt_id, created_by_user_id, operation_type, network, source_account, destination_account, transaction_sequence, base_fee, amount_minor, asset_code, asset_scale, asset_issuer, memo_text, idempotency_key, request_sha256, transaction_body_sha256, unsigned_envelope_sha256, unsigned_envelope_xdr, status, expires_at) VALUES ($1, $2, $3, $4, $5, 'payment', 'testnet', $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, 'awaiting_signature', $20)",
    )
    .bind(intent_id)
    .bind(payment.0)
    .bind(order_id)
    .bind(body.payment_attempt_id)
    .bind(actor_user_id)
    .bind(&source_account)
    .bind(&destination_account)
    .bind(transaction_sequence)
    .bind(base_fee as i32)
    .bind(payment.3)
    .bind(&payment.4)
    .bind(payment.5)
    .bind(&payment.6)
    .bind(&memo_text)
    .bind(&idempotency_key)
    .bind(&request_sha256)
    .bind(&built.transaction_body_sha256)
    .bind(&built.unsigned_envelope_sha256)
    .bind(&built.envelope_xdr)
    .bind(expires_at)
    .execute(&mut *tx)
    .await
    .map_err(map_database_error)?;

    write_audit(
        &mut tx,
        payment.0,
        actor_user_id,
        "stellar_transaction_intent.create",
        "transaction_intent",
        intent_id,
        serde_json::json!({
            "order_id": order_id,
            "payment_attempt_id": body.payment_attempt_id,
            "source_account": source_account,
            "destination_account": destination_account,
            "amount_minor": payment.3,
            "asset_code": payment.4,
            "network": "testnet",
            "expires_at": expires_at,
        }),
    )
    .await?;
    tx.commit().await.map_err(map_database_error)?;

    Ok((
        StatusCode::CREATED,
        Json(load_transaction_intent(pool, intent_id).await?),
    ))
}

async fn get_transaction_intent(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(intent_id): Path<Uuid>,
) -> Result<Json<TransactionIntentResponse>, ApiError> {
    let actor_user_id = require_admin_actor(&state, &headers)?;
    let pool = database_pool(&state)?;
    let organization_id = sqlx::query_scalar::<_, Uuid>(
        "SELECT organization_id FROM transaction_intents WHERE id = $1",
    )
    .bind(intent_id)
    .fetch_optional(pool)
    .await
    .map_err(map_database_error)?
    .ok_or(ApiError::NotFound)?;
    require_organization_editor(pool, organization_id, actor_user_id).await?;
    Ok(Json(load_transaction_intent(pool, intent_id).await?))
}

async fn accept_signed_envelope(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(intent_id): Path<Uuid>,
    Json(body): Json<SignedEnvelopeRequest>,
) -> Result<(StatusCode, Json<TransactionIntentResponse>), ApiError> {
    let actor_user_id = require_admin_actor(&state, &headers)?;
    let pool = database_pool(&state)?;
    let signed_envelope_xdr = required_text(
        body.signed_envelope_xdr,
        100_000,
        "invalid_signed_envelope_xdr",
    )?;
    let envelope_bytes = decode_base64(&signed_envelope_xdr)?;
    let parsed = parse_payment_envelope(&envelope_bytes)?;
    if parsed.signature_count == 0 {
        return Err(ApiError::InvalidRequest(
            "signed_envelope_has_no_signatures",
        ));
    }

    let mut tx = pool.begin().await.map_err(map_database_error)?;
    let intent = load_intent_for_update(&mut tx, intent_id).await?;
    require_organization_editor_tx(&mut tx, intent.organization_id, actor_user_id).await?;

    let envelope_sha256 = hash_bytes(&envelope_bytes);
    if let Some(existing) = sqlx::query_as::<_, StellarTransactionRecord>(
        "SELECT id, transaction_intent_id, network, envelope_sha256, signed_envelope_xdr, transaction_hash, status, horizon_status_code, horizon_response, failure_code, submitted_at, confirmed_at, created_at, updated_at FROM stellar_transactions WHERE transaction_intent_id = $1",
    )
    .bind(intent_id)
    .fetch_optional(&mut *tx)
    .await
    .map_err(map_database_error)?
    {
        if existing.envelope_sha256 != envelope_sha256 {
            return Err(ApiError::Conflict("transaction_intent_already_signed"));
        }
        tx.commit().await.map_err(map_database_error)?;
        return Ok((
            StatusCode::OK,
            Json(load_transaction_intent(pool, intent_id).await?),
        ));
    }

    if intent.status != "awaiting_signature" {
        return Err(ApiError::Conflict(
            "transaction_intent_not_awaiting_signature",
        ));
    }
    if intent.expires_at <= OffsetDateTime::now_utc() {
        sqlx::query(
            "UPDATE transaction_intents SET status = 'expired', failure_code = 'intent_expired', updated_at = now() WHERE id = $1",
        )
        .bind(intent_id)
        .execute(&mut *tx)
        .await
        .map_err(map_database_error)?;
        tx.commit().await.map_err(map_database_error)?;
        return Err(ApiError::Conflict("transaction_intent_expired"));
    }

    validate_signed_envelope_against_intent(&parsed, &intent)?;
    let transaction_hash = transaction_hash(&parsed.transaction_body);
    let transaction_id = Uuid::new_v4();

    sqlx::query(
        "INSERT INTO stellar_transactions (id, transaction_intent_id, network, envelope_sha256, signed_envelope_xdr, transaction_hash, status) VALUES ($1, $2, 'testnet', $3, $4, $5, 'signed')",
    )
    .bind(transaction_id)
    .bind(intent_id)
    .bind(&envelope_sha256)
    .bind(&signed_envelope_xdr)
    .bind(&transaction_hash)
    .execute(&mut *tx)
    .await
    .map_err(map_database_error)?;

    sqlx::query(
        "UPDATE transaction_intents SET status = 'signed', signed_at = now(), failure_code = NULL, updated_at = now() WHERE id = $1",
    )
    .bind(intent_id)
    .execute(&mut *tx)
    .await
    .map_err(map_database_error)?;

    write_audit(
        &mut tx,
        intent.organization_id,
        actor_user_id,
        "stellar_signed_envelope.accept",
        "stellar_transaction",
        transaction_id,
        serde_json::json!({
            "transaction_intent_id": intent_id,
            "transaction_hash": transaction_hash,
            "network": "testnet",
        }),
    )
    .await?;
    tx.commit().await.map_err(map_database_error)?;

    Ok((
        StatusCode::CREATED,
        Json(load_transaction_intent(pool, intent_id).await?),
    ))
}

async fn load_transaction_intent(
    pool: &PgPool,
    intent_id: Uuid,
) -> Result<TransactionIntentResponse, ApiError> {
    let intent = sqlx::query_as::<_, TransactionIntentRecord>(
        "SELECT id, organization_id, order_id, payment_attempt_id, created_by_user_id, operation_type, network, source_account, destination_account, transaction_sequence, base_fee, amount_minor, asset_code, asset_scale, asset_issuer, memo_text, idempotency_key, request_sha256, transaction_body_sha256, unsigned_envelope_sha256, unsigned_envelope_xdr, status, expires_at, signed_at, submitted_at, confirmed_at, failure_code, created_at, updated_at FROM transaction_intents WHERE id = $1",
    )
    .bind(intent_id)
    .fetch_optional(pool)
    .await
    .map_err(map_database_error)?
    .ok_or(ApiError::NotFound)?;
    let transaction = sqlx::query_as::<_, StellarTransactionRecord>(
        "SELECT id, transaction_intent_id, network, envelope_sha256, signed_envelope_xdr, transaction_hash, status, horizon_status_code, horizon_response, failure_code, submitted_at, confirmed_at, created_at, updated_at FROM stellar_transactions WHERE transaction_intent_id = $1",
    )
    .bind(intent_id)
    .fetch_optional(pool)
    .await
    .map_err(map_database_error)?;
    Ok(TransactionIntentResponse {
        intent,
        transaction,
    })
}

async fn load_intent_for_update(
    tx: &mut Transaction<'_, Postgres>,
    intent_id: Uuid,
) -> Result<TransactionIntentRecord, ApiError> {
    sqlx::query_as::<_, TransactionIntentRecord>(
        "SELECT id, organization_id, order_id, payment_attempt_id, created_by_user_id, operation_type, network, source_account, destination_account, transaction_sequence, base_fee, amount_minor, asset_code, asset_scale, asset_issuer, memo_text, idempotency_key, request_sha256, transaction_body_sha256, unsigned_envelope_sha256, unsigned_envelope_xdr, status, expires_at, signed_at, submitted_at, confirmed_at, failure_code, created_at, updated_at FROM transaction_intents WHERE id = $1 FOR UPDATE",
    )
    .bind(intent_id)
    .fetch_optional(&mut **tx)
    .await
    .map_err(map_database_error)?
    .ok_or(ApiError::NotFound)
}

fn build_unsigned_payment_envelope(
    source_account: &str,
    destination_account: &str,
    transaction_sequence: i64,
    base_fee: u32,
    amount_minor: i64,
    asset_code: &str,
    asset_issuer: Option<&str>,
    memo_text: &str,
    expires_at_unix: i64,
) -> Result<BuiltEnvelope, ApiError> {
    if amount_minor <= 0 || expires_at_unix <= 0 {
        return Err(ApiError::InvalidRequest("invalid_stellar_payment_intent"));
    }
    if memo_text.is_empty() || memo_text.len() > 28 {
        return Err(ApiError::InvalidRequest("invalid_stellar_memo"));
    }
    let source_key = decode_stellar_account(source_account)?;
    let destination_key = decode_stellar_account(destination_account)?;

    let mut transaction_body = Vec::with_capacity(256);
    write_i32(&mut transaction_body, KEY_TYPE_ED25519);
    transaction_body.extend_from_slice(&source_key);
    write_u32(&mut transaction_body, base_fee);
    write_i64(&mut transaction_body, transaction_sequence);
    write_i32(&mut transaction_body, PRECOND_TIME);
    write_u64(&mut transaction_body, 0);
    write_u64(&mut transaction_body, expires_at_unix as u64);
    write_i32(&mut transaction_body, MEMO_TEXT);
    write_xdr_string(&mut transaction_body, memo_text, 28)?;
    write_u32(&mut transaction_body, 1);
    write_i32(&mut transaction_body, 0);
    write_i32(&mut transaction_body, OPERATION_PAYMENT);
    write_i32(&mut transaction_body, KEY_TYPE_ED25519);
    transaction_body.extend_from_slice(&destination_key);
    write_asset(&mut transaction_body, asset_code, asset_issuer)?;
    write_i64(&mut transaction_body, amount_minor);
    write_i32(&mut transaction_body, 0);

    let transaction_body_sha256 = hash_bytes(&transaction_body);
    let mut envelope = Vec::with_capacity(transaction_body.len() + 8);
    write_i32(&mut envelope, ENVELOPE_TYPE_TX);
    envelope.extend_from_slice(&transaction_body);
    write_u32(&mut envelope, 0);
    let unsigned_envelope_sha256 = hash_bytes(&envelope);
    let envelope_xdr = encode_base64(&envelope);

    Ok(BuiltEnvelope {
        envelope_xdr,
        transaction_body_sha256,
        unsigned_envelope_sha256,
    })
}

fn parse_payment_envelope(bytes: &[u8]) -> Result<ParsedEnvelope, ApiError> {
    let mut reader = XdrReader::new(bytes);
    if reader.read_i32()? != ENVELOPE_TYPE_TX {
        return Err(ApiError::InvalidRequest(
            "unsupported_stellar_envelope_type",
        ));
    }
    let transaction_start = reader.position();
    let source_account = reader.read_ed25519_account()?;
    let fee = reader.read_u32()?;
    let sequence = reader.read_i64()?;
    let precondition = reader.read_i32()?;
    let max_time = match precondition {
        PRECOND_NONE => None,
        PRECOND_TIME => {
            let _min_time = reader.read_u64()?;
            Some(reader.read_u64()?)
        }
        _ => {
            return Err(ApiError::InvalidRequest(
                "unsupported_stellar_preconditions",
            ))
        }
    };
    let memo_text = match reader.read_i32()? {
        MEMO_NONE => None,
        MEMO_TEXT => Some(reader.read_xdr_string(28)?),
        _ => return Err(ApiError::InvalidRequest("unsupported_stellar_memo")),
    };
    if reader.read_u32()? != 1 {
        return Err(ApiError::InvalidRequest(
            "stellar_intent_requires_one_operation",
        ));
    }
    if reader.read_i32()? != 0 {
        return Err(ApiError::InvalidRequest("operation_source_not_allowed"));
    }
    if reader.read_i32()? != OPERATION_PAYMENT {
        return Err(ApiError::InvalidRequest("unsupported_stellar_operation"));
    }
    let destination_account = reader.read_ed25519_account()?;
    let (asset_code, asset_issuer) = reader.read_asset()?;
    let amount = reader.read_i64()?;
    if reader.read_i32()? != 0 {
        return Err(ApiError::InvalidRequest(
            "unsupported_transaction_extension",
        ));
    }
    let transaction_end = reader.position();
    let signature_count = reader.read_u32()?;
    if signature_count > 20 {
        return Err(ApiError::InvalidRequest("too_many_stellar_signatures"));
    }
    for _ in 0..signature_count {
        reader.read_fixed(4)?;
        reader.read_var_opaque(64)?;
    }
    if !reader.is_finished() {
        return Err(ApiError::InvalidRequest("trailing_stellar_xdr_bytes"));
    }

    Ok(ParsedEnvelope {
        transaction_body: bytes[transaction_start..transaction_end].to_vec(),
        source_account,
        sequence,
        fee,
        max_time,
        memo_text,
        destination_account,
        asset_code,
        asset_issuer,
        amount,
        signature_count,
    })
}

fn validate_signed_envelope_against_intent(
    parsed: &ParsedEnvelope,
    intent: &TransactionIntentRecord,
) -> Result<(), ApiError> {
    if hash_bytes(&parsed.transaction_body) != intent.transaction_body_sha256 {
        return Err(ApiError::Conflict("signed_envelope_body_mismatch"));
    }
    if parsed.source_account != decode_stellar_account(&intent.source_account)?
        || parsed.destination_account != decode_stellar_account(&intent.destination_account)?
        || parsed.sequence != intent.transaction_sequence
        || parsed.fee != intent.base_fee as u32
        || parsed.amount != intent.amount_minor
        || parsed.asset_code != intent.asset_code
        || parsed.memo_text.as_deref() != Some(intent.memo_text.as_str())
    {
        return Err(ApiError::Conflict("signed_envelope_intent_mismatch"));
    }
    let expected_issuer = intent
        .asset_issuer
        .as_deref()
        .map(decode_stellar_account)
        .transpose()?;
    if parsed.asset_issuer != expected_issuer {
        return Err(ApiError::Conflict("signed_envelope_asset_mismatch"));
    }
    let expected_max_time = intent.expires_at.unix_timestamp();
    if expected_max_time <= 0 || parsed.max_time != Some(expected_max_time as u64) {
        return Err(ApiError::Conflict("signed_envelope_expiry_mismatch"));
    }
    Ok(())
}

fn transaction_hash(transaction_body: &[u8]) -> String {
    let network_id = Sha256::digest(TESTNET_NETWORK_PASSPHRASE.as_bytes());
    let mut payload = Vec::with_capacity(36 + transaction_body.len());
    payload.extend_from_slice(&network_id);
    write_i32(&mut payload, ENVELOPE_TYPE_TX);
    payload.extend_from_slice(transaction_body);
    hash_bytes(&payload)
}

fn write_asset(
    output: &mut Vec<u8>,
    asset_code: &str,
    asset_issuer: Option<&str>,
) -> Result<(), ApiError> {
    if asset_code == "XLM" {
        if asset_issuer.is_some() {
            return Err(ApiError::InvalidRequest("xlm_must_not_have_issuer"));
        }
        write_i32(output, ASSET_NATIVE);
        return Ok(());
    }
    let issuer = asset_issuer.ok_or(ApiError::InvalidRequest("asset_issuer_required"))?;
    let issuer_key = decode_stellar_account(issuer)?;
    let code = asset_code.as_bytes();
    let width = if code.len() <= 4 {
        write_i32(output, ASSET_ALPHANUM4);
        4usize
    } else if code.len() <= 12 {
        write_i32(output, ASSET_ALPHANUM12);
        12usize
    } else {
        return Err(ApiError::InvalidRequest("invalid_asset_code"));
    };
    if code.is_empty()
        || !code
            .iter()
            .all(|value| value.is_ascii_uppercase() || value.is_ascii_digit())
    {
        return Err(ApiError::InvalidRequest("invalid_asset_code"));
    }
    output.extend_from_slice(code);
    output.resize(output.len() + (width - code.len()), 0);
    write_i32(output, KEY_TYPE_ED25519);
    output.extend_from_slice(&issuer_key);
    Ok(())
}

fn normalize_stellar_account(value: String) -> Result<String, ApiError> {
    let value = value.trim().to_ascii_uppercase();
    decode_stellar_account(&value)?;
    Ok(value)
}

fn decode_stellar_account(value: &str) -> Result<[u8; 32], ApiError> {
    if value.len() != 56 {
        return Err(ApiError::InvalidRequest("invalid_stellar_account"));
    }
    let mut decoded = Vec::with_capacity(35);
    let mut accumulator = 0u64;
    let mut bits = 0usize;
    for character in value.bytes() {
        let digit = match character {
            b'A'..=b'Z' => character - b'A',
            b'2'..=b'7' => character - b'2' + 26,
            _ => return Err(ApiError::InvalidRequest("invalid_stellar_account")),
        };
        accumulator = (accumulator << 5) | u64::from(digit);
        bits += 5;
        while bits >= 8 {
            bits -= 8;
            decoded.push(((accumulator >> bits) & 0xff) as u8);
            accumulator &= if bits == 0 { 0 } else { (1u64 << bits) - 1 };
        }
    }
    if bits != 0 || decoded.len() != 35 || decoded[0] != 48 {
        return Err(ApiError::InvalidRequest("invalid_stellar_account"));
    }
    let expected_checksum = u16::from_le_bytes([decoded[33], decoded[34]]);
    if crc16_xmodem(&decoded[..33]) != expected_checksum {
        return Err(ApiError::InvalidRequest("invalid_stellar_account_checksum"));
    }
    let mut account = [0u8; 32];
    account.copy_from_slice(&decoded[1..33]);
    Ok(account)
}

fn crc16_xmodem(bytes: &[u8]) -> u16 {
    let mut crc = 0u16;
    for byte in bytes {
        crc ^= u16::from(*byte) << 8;
        for _ in 0..8 {
            crc = if crc & 0x8000 != 0 {
                (crc << 1) ^ 0x1021
            } else {
                crc << 1
            };
        }
    }
    crc
}

fn encode_base64(bytes: &[u8]) -> String {
    let mut output = String::with_capacity(bytes.len().div_ceil(3) * 4);
    for chunk in bytes.chunks(3) {
        let first = chunk[0];
        let second = chunk.get(1).copied().unwrap_or(0);
        let third = chunk.get(2).copied().unwrap_or(0);
        let combined = (u32::from(first) << 16) | (u32::from(second) << 8) | u32::from(third);
        output.push(BASE64_ALPHABET[((combined >> 18) & 0x3f) as usize] as char);
        output.push(BASE64_ALPHABET[((combined >> 12) & 0x3f) as usize] as char);
        output.push(if chunk.len() > 1 {
            BASE64_ALPHABET[((combined >> 6) & 0x3f) as usize] as char
        } else {
            '='
        });
        output.push(if chunk.len() > 2 {
            BASE64_ALPHABET[(combined & 0x3f) as usize] as char
        } else {
            '='
        });
    }
    output
}

fn decode_base64(value: &str) -> Result<Vec<u8>, ApiError> {
    let bytes = value.as_bytes();
    if bytes.is_empty() || bytes.len() % 4 != 0 {
        return Err(ApiError::InvalidRequest("invalid_signed_envelope_xdr"));
    }
    let mut output = Vec::with_capacity((bytes.len() / 4) * 3);
    for (index, chunk) in bytes.chunks_exact(4).enumerate() {
        let is_last = index + 1 == bytes.len() / 4;
        let first = base64_value(chunk[0])?;
        let second = base64_value(chunk[1])?;
        let third_padding = chunk[2] == b'=';
        let fourth_padding = chunk[3] == b'=';
        if third_padding && !fourth_padding {
            return Err(ApiError::InvalidRequest("invalid_signed_envelope_xdr"));
        }
        if (third_padding || fourth_padding) && !is_last {
            return Err(ApiError::InvalidRequest("invalid_signed_envelope_xdr"));
        }
        let third = if third_padding {
            0
        } else {
            base64_value(chunk[2])?
        };
        let fourth = if fourth_padding {
            0
        } else {
            base64_value(chunk[3])?
        };
        let combined = (u32::from(first) << 18)
            | (u32::from(second) << 12)
            | (u32::from(third) << 6)
            | u32::from(fourth);
        output.push(((combined >> 16) & 0xff) as u8);
        if !third_padding {
            output.push(((combined >> 8) & 0xff) as u8);
        }
        if !fourth_padding {
            output.push((combined & 0xff) as u8);
        }
    }
    Ok(output)
}

fn base64_value(value: u8) -> Result<u8, ApiError> {
    match value {
        b'A'..=b'Z' => Ok(value - b'A'),
        b'a'..=b'z' => Ok(value - b'a' + 26),
        b'0'..=b'9' => Ok(value - b'0' + 52),
        b'+' => Ok(62),
        b'/' => Ok(63),
        _ => Err(ApiError::InvalidRequest("invalid_signed_envelope_xdr")),
    }
}

struct XdrReader<'a> {
    bytes: &'a [u8],
    position: usize,
}

impl<'a> XdrReader<'a> {
    fn new(bytes: &'a [u8]) -> Self {
        Self { bytes, position: 0 }
    }

    fn position(&self) -> usize {
        self.position
    }

    fn is_finished(&self) -> bool {
        self.position == self.bytes.len()
    }

    fn read_fixed(&mut self, length: usize) -> Result<&'a [u8], ApiError> {
        let end = self
            .position
            .checked_add(length)
            .ok_or(ApiError::InvalidRequest("invalid_stellar_xdr"))?;
        if end > self.bytes.len() {
            return Err(ApiError::InvalidRequest("invalid_stellar_xdr"));
        }
        let value = &self.bytes[self.position..end];
        self.position = end;
        Ok(value)
    }

    fn read_i32(&mut self) -> Result<i32, ApiError> {
        let bytes: [u8; 4] = self
            .read_fixed(4)?
            .try_into()
            .map_err(|_| ApiError::InvalidRequest("invalid_stellar_xdr"))?;
        Ok(i32::from_be_bytes(bytes))
    }

    fn read_u32(&mut self) -> Result<u32, ApiError> {
        let bytes: [u8; 4] = self
            .read_fixed(4)?
            .try_into()
            .map_err(|_| ApiError::InvalidRequest("invalid_stellar_xdr"))?;
        Ok(u32::from_be_bytes(bytes))
    }

    fn read_i64(&mut self) -> Result<i64, ApiError> {
        let bytes: [u8; 8] = self
            .read_fixed(8)?
            .try_into()
            .map_err(|_| ApiError::InvalidRequest("invalid_stellar_xdr"))?;
        Ok(i64::from_be_bytes(bytes))
    }

    fn read_u64(&mut self) -> Result<u64, ApiError> {
        let bytes: [u8; 8] = self
            .read_fixed(8)?
            .try_into()
            .map_err(|_| ApiError::InvalidRequest("invalid_stellar_xdr"))?;
        Ok(u64::from_be_bytes(bytes))
    }

    fn read_ed25519_account(&mut self) -> Result<[u8; 32], ApiError> {
        if self.read_i32()? != KEY_TYPE_ED25519 {
            return Err(ApiError::InvalidRequest("unsupported_muxed_account"));
        }
        let mut account = [0u8; 32];
        account.copy_from_slice(self.read_fixed(32)?);
        Ok(account)
    }

    fn read_xdr_string(&mut self, max_length: usize) -> Result<String, ApiError> {
        let bytes = self.read_var_opaque(max_length)?;
        String::from_utf8(bytes.to_vec())
            .map_err(|_| ApiError::InvalidRequest("invalid_stellar_memo"))
    }

    fn read_var_opaque(&mut self, max_length: usize) -> Result<&'a [u8], ApiError> {
        let length = self.read_u32()? as usize;
        if length > max_length {
            return Err(ApiError::InvalidRequest("invalid_stellar_xdr_length"));
        }
        let value = self.read_fixed(length)?;
        let padding = (4 - (length % 4)) % 4;
        let padding_bytes = self.read_fixed(padding)?;
        if padding_bytes.iter().any(|byte| *byte != 0) {
            return Err(ApiError::InvalidRequest("invalid_stellar_xdr_padding"));
        }
        Ok(value)
    }

    fn read_asset(&mut self) -> Result<(String, Option<[u8; 32]>), ApiError> {
        match self.read_i32()? {
            ASSET_NATIVE => Ok(("XLM".to_string(), None)),
            ASSET_ALPHANUM4 => {
                let code = decode_asset_code(self.read_fixed(4)?)?;
                let issuer = self.read_ed25519_account()?;
                Ok((code, Some(issuer)))
            }
            ASSET_ALPHANUM12 => {
                let code = decode_asset_code(self.read_fixed(12)?)?;
                let issuer = self.read_ed25519_account()?;
                Ok((code, Some(issuer)))
            }
            _ => Err(ApiError::InvalidRequest("unsupported_stellar_asset")),
        }
    }
}

fn decode_asset_code(bytes: &[u8]) -> Result<String, ApiError> {
    let end = bytes
        .iter()
        .position(|value| *value == 0)
        .unwrap_or(bytes.len());
    if bytes[end..].iter().any(|value| *value != 0) || end == 0 {
        return Err(ApiError::InvalidRequest("invalid_asset_code"));
    }
    let code = std::str::from_utf8(&bytes[..end])
        .map_err(|_| ApiError::InvalidRequest("invalid_asset_code"))?;
    if !code
        .bytes()
        .all(|value| value.is_ascii_uppercase() || value.is_ascii_digit())
    {
        return Err(ApiError::InvalidRequest("invalid_asset_code"));
    }
    Ok(code.to_string())
}

fn write_i32(output: &mut Vec<u8>, value: i32) {
    output.extend_from_slice(&value.to_be_bytes());
}

fn write_u32(output: &mut Vec<u8>, value: u32) {
    output.extend_from_slice(&value.to_be_bytes());
}

fn write_i64(output: &mut Vec<u8>, value: i64) {
    output.extend_from_slice(&value.to_be_bytes());
}

fn write_u64(output: &mut Vec<u8>, value: u64) {
    output.extend_from_slice(&value.to_be_bytes());
}

fn write_xdr_string(output: &mut Vec<u8>, value: &str, max_length: usize) -> Result<(), ApiError> {
    let bytes = value.as_bytes();
    if bytes.len() > max_length {
        return Err(ApiError::InvalidRequest("invalid_stellar_memo"));
    }
    write_u32(output, bytes.len() as u32);
    output.extend_from_slice(bytes);
    output.resize(output.len() + ((4 - (bytes.len() % 4)) % 4), 0);
    Ok(())
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

fn required_text(value: String, max_len: usize, error: &'static str) -> Result<String, ApiError> {
    let value = value.trim().to_string();
    if value.is_empty() || value.chars().count() > max_len {
        Err(ApiError::InvalidRequest(error))
    } else {
        Ok(value)
    }
}

fn hash_text(value: &str) -> String {
    hex::encode(Sha256::digest(value.as_bytes()))
}

fn hash_bytes(value: &[u8]) -> String {
    hex::encode(Sha256::digest(value))
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
                tracing::error!(%error, "Stellar transaction intent database operation failed");
                ApiError::Database
            }
        };
    }
    tracing::error!(%error, "Stellar transaction intent database operation failed");
    ApiError::Database
}

#[cfg(test)]
mod tests {
    use super::*;

    const SOURCE: &str = "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF";
    const DESTINATION: &str = "GAAQEAYEAUDAOCAJBIFQYDIOB4IBCEQTCQKRMFYYDENBWHA5DYPSABOV";

    #[test]
    fn builds_and_parses_one_payment_envelope() {
        let built = build_unsigned_payment_envelope(
            SOURCE,
            DESTINATION,
            1,
            100,
            2_500_000,
            "XLM",
            None,
            "CFI-test",
            1_900_000_000,
        )
        .unwrap();
        let bytes = decode_base64(&built.envelope_xdr).unwrap();
        let parsed = parse_payment_envelope(&bytes).unwrap();
        assert_eq!(parsed.sequence, 1);
        assert_eq!(parsed.fee, 100);
        assert_eq!(parsed.amount, 2_500_000);
        assert_eq!(parsed.asset_code, "XLM");
        assert_eq!(parsed.memo_text.as_deref(), Some("CFI-test"));
        assert_eq!(parsed.signature_count, 0);
        assert_eq!(
            hash_bytes(&parsed.transaction_body),
            built.transaction_body_sha256
        );
    }

    #[test]
    fn base64_round_trip_is_exact() {
        let bytes = b"CrownFi Stellar XDR";
        assert_eq!(decode_base64(&encode_base64(bytes)).unwrap(), bytes);
    }

    #[test]
    fn rejects_bad_strkey_checksum() {
        let mut account = SOURCE.as_bytes().to_vec();
        account[55] = if account[55] == b'A' { b'B' } else { b'A' };
        let account = String::from_utf8(account).unwrap();
        assert!(decode_stellar_account(&account).is_err());
    }
}
