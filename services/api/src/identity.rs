use axum::{
    extract::{Path, State},
    http::{HeaderMap, StatusCode},
    routing::{get, patch, post},
    Json, Router,
};
use serde::{Deserialize, Serialize};
use serde_json::json;
use sqlx::{FromRow, PgPool, Postgres, Transaction};
use time::{format_description::well_known::Rfc3339, Duration, OffsetDateTime};
use uuid::Uuid;

use crate::{error::ApiError, state::AppState};

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/setup/status", get(setup_status))
        .route(
            "/internal/identity/challenges",
            post(create_wallet_challenge),
        )
        .route(
            "/internal/identity/challenges/:challenge_id/consume",
            post(consume_wallet_challenge),
        )
        .route(
            "/internal/identity/users/:user_id",
            get(get_account_profile),
        )
        .route("/internal/setup/complete", post(complete_setup))
        .route(
            "/internal/site-settings",
            get(get_site_settings).merge(patch(update_site_settings)),
        )
}

#[derive(Debug, Clone, Serialize, FromRow)]
pub struct SiteSettingsRecord {
    pub site_name: String,
    pub stellar_network: String,
    pub mainnet_enabled: bool,
    pub default_pageant_id: Option<Uuid>,
    pub pageant_selector_enabled: bool,
    pub setup_completed_at: Option<OffsetDateTime>,
    pub setup_completed_by_user_id: Option<Uuid>,
    pub updated_at: OffsetDateTime,
}

#[derive(Debug, Serialize)]
pub struct SetupStatusResponse {
    pub setup_required: bool,
    pub site_name: String,
    pub stellar_network: String,
    pub mainnet_available: bool,
    pub default_pageant_id: Option<Uuid>,
    pub pageant_selector_enabled: bool,
}

#[derive(Debug, Clone, Serialize, FromRow)]
pub struct WalletRecord {
    pub id: Uuid,
    pub network: String,
    pub address: String,
    pub is_primary: bool,
    pub verified_at: Option<OffsetDateTime>,
    pub created_at: OffsetDateTime,
}

#[derive(Debug, Clone, Serialize, FromRow)]
pub struct OrganizationRoleRecord {
    pub organization_id: Uuid,
    pub organization_name: String,
    pub organization_slug: String,
    pub role: String,
}

#[derive(Debug, Clone, Serialize, FromRow)]
struct UserRecord {
    id: Uuid,
    display_name: String,
    email: Option<String>,
    status: String,
    created_at: OffsetDateTime,
    updated_at: OffsetDateTime,
}

#[derive(Debug, Clone, Serialize)]
pub struct AccountProfile {
    pub id: Uuid,
    pub display_name: String,
    pub email: Option<String>,
    pub status: String,
    pub site_role: Option<String>,
    pub wallets: Vec<WalletRecord>,
    pub organization_roles: Vec<OrganizationRoleRecord>,
    pub created_at: OffsetDateTime,
    pub updated_at: OffsetDateTime,
}

#[derive(Debug, Deserialize)]
struct CreateChallengeRequest {
    address: String,
    network: String,
    purpose: String,
    requested_user_id: Option<Uuid>,
    origin: Option<String>,
}

#[derive(Debug, Serialize)]
struct CreateChallengeResponse {
    challenge_id: Uuid,
    message: String,
    expires_at: OffsetDateTime,
}

#[derive(Debug, FromRow)]
struct ConsumedChallenge {
    purpose: String,
    requested_user_id: Option<Uuid>,
}

#[derive(Debug, Deserialize)]
struct ConsumeChallengeRequest {
    address: String,
    network: String,
    message: String,
    requested_user_id: Option<Uuid>,
}

#[derive(Debug, Serialize)]
struct WalletAuthResponse {
    profile: AccountProfile,
    current_wallet: String,
}

#[derive(Debug, Deserialize)]
struct ProtectedIntegrationInput {
    provider: String,
    protected_value: String,
    value_suffix: Option<String>,
}

#[derive(Debug, Deserialize)]
struct CompleteSetupRequest {
    bootstrap_token: String,
    user_id: Uuid,
    display_name: String,
    email: Option<String>,
    site_name: String,
    organization_name: String,
    organization_slug: String,
    stellar_network: String,
    integrations: Option<Vec<ProtectedIntegrationInput>>,
}

#[derive(Debug, Serialize)]
struct CompleteSetupResponse {
    profile: AccountProfile,
    settings: SiteSettingsRecord,
}

#[derive(Debug, Clone, Serialize, FromRow)]
struct IntegrationMetadata {
    provider: String,
    value_suffix: Option<String>,
    validation_status: String,
    last_validated_at: Option<OffsetDateTime>,
    updated_at: OffsetDateTime,
}

#[derive(Debug, Serialize)]
struct SiteSettingsResponse {
    settings: SiteSettingsRecord,
    mainnet_available: bool,
    integrations: Vec<IntegrationMetadata>,
}

#[derive(Debug, Deserialize)]
struct UpdateSiteSettingsRequest {
    actor_user_id: Uuid,
    site_name: Option<String>,
    stellar_network: Option<String>,
    default_pageant_id: Option<Uuid>,
    clear_default_pageant: Option<bool>,
    pageant_selector_enabled: Option<bool>,
}

async fn setup_status(
    State(state): State<AppState>,
) -> Result<Json<SetupStatusResponse>, ApiError> {
    let settings = load_site_settings(database_pool(&state)?).await?;
    Ok(Json(SetupStatusResponse {
        setup_required: settings.setup_completed_at.is_none(),
        site_name: settings.site_name,
        stellar_network: settings.stellar_network,
        mainnet_available: state.config.allow_mainnet && settings.mainnet_enabled,
        default_pageant_id: settings.default_pageant_id,
        pageant_selector_enabled: settings.pageant_selector_enabled,
    }))
}

async fn create_wallet_challenge(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(body): Json<CreateChallengeRequest>,
) -> Result<(StatusCode, Json<CreateChallengeResponse>), ApiError> {
    require_internal(&state, &headers)?;
    let pool = database_pool(&state)?;
    let address = validate_address(body.address)?;
    let network = validate_network(&state, body.network)?;
    let purpose = validate_purpose(body.purpose)?;
    if purpose == "link" && body.requested_user_id.is_none() {
        return Err(ApiError::InvalidRequest("link_user_required"));
    }
    if let Some(user_id) = body.requested_user_id {
        ensure_user_exists(pool, user_id).await?;
    }

    let challenge_id = Uuid::new_v4();
    let now = OffsetDateTime::now_utc();
    let expires_at = now + Duration::minutes(5);
    let origin = body
        .origin
        .map(|value| value.trim().chars().take(300).collect::<String>())
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| "CrownFi".to_string());
    let issued = now.format(&Rfc3339).map_err(|_| ApiError::Database)?;
    let expires = expires_at
        .format(&Rfc3339)
        .map_err(|_| ApiError::Database)?;
    let message = format!(
        "CrownFi account authorization\nAddress: {address}\nNetwork: {network}\nPurpose: {purpose}\nChallenge: {challenge_id}\nOrigin: {origin}\nIssued At: {issued}\nExpires At: {expires}"
    );

    sqlx::query(
        "INSERT INTO wallet_auth_challenges (id, address, network, purpose, requested_user_id, message, expires_at) VALUES ($1, $2, $3, $4, $5, $6, $7)",
    )
    .bind(challenge_id)
    .bind(&address)
    .bind(&network)
    .bind(&purpose)
    .bind(body.requested_user_id)
    .bind(&message)
    .bind(expires_at)
    .execute(pool)
    .await
    .map_err(map_database_error)?;

    Ok((
        StatusCode::CREATED,
        Json(CreateChallengeResponse {
            challenge_id,
            message,
            expires_at,
        }),
    ))
}

async fn consume_wallet_challenge(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(challenge_id): Path<Uuid>,
    Json(body): Json<ConsumeChallengeRequest>,
) -> Result<Json<WalletAuthResponse>, ApiError> {
    require_internal(&state, &headers)?;
    let pool = database_pool(&state)?;
    let address = validate_address(body.address)?;
    let network = validate_network(&state, body.network)?;
    let mut tx = pool.begin().await.map_err(map_database_error)?;

    let challenge = sqlx::query_as::<_, ConsumedChallenge>(
        "UPDATE wallet_auth_challenges SET consumed_at = now() WHERE id = $1 AND address = $2 AND network = $3 AND message = $4 AND consumed_at IS NULL AND expires_at > now() RETURNING purpose, requested_user_id",
    )
    .bind(challenge_id)
    .bind(&address)
    .bind(&network)
    .bind(&body.message)
    .fetch_optional(&mut *tx)
    .await
    .map_err(map_database_error)?
    .ok_or(ApiError::Unauthorized)?;

    if challenge.requested_user_id != body.requested_user_id {
        return Err(ApiError::Unauthorized);
    }

    let user_id = match challenge.purpose.as_str() {
        "login" | "setup" => login_or_create_account(&mut tx, &network, &address).await?,
        "link" => {
            let requested_user_id = challenge
                .requested_user_id
                .ok_or(ApiError::InvalidRequest("link_user_required"))?;
            link_wallet(&mut tx, requested_user_id, &network, &address).await?;
            requested_user_id
        }
        _ => return Err(ApiError::InvalidRequest("invalid_challenge_purpose")),
    };

    write_audit(
        &mut tx,
        user_id,
        if challenge.purpose == "link" {
            "wallet.link"
        } else {
            "wallet.login"
        },
        json!({"network": network, "address_suffix": suffix(&address)}),
    )
    .await?;
    tx.commit().await.map_err(map_database_error)?;

    Ok(Json(WalletAuthResponse {
        profile: load_profile(pool, user_id).await?,
        current_wallet: address,
    }))
}

async fn get_account_profile(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(user_id): Path<Uuid>,
) -> Result<Json<AccountProfile>, ApiError> {
    require_internal(&state, &headers)?;
    Ok(Json(load_profile(database_pool(&state)?, user_id).await?))
}

async fn complete_setup(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(body): Json<CompleteSetupRequest>,
) -> Result<(StatusCode, Json<CompleteSetupResponse>), ApiError> {
    require_internal(&state, &headers)?;
    if body.bootstrap_token != state.config.setup_bootstrap_token {
        return Err(ApiError::Unauthorized);
    }
    let pool = database_pool(&state)?;
    let display_name = required_text(body.display_name, 160, "invalid_display_name")?;
    let email = optional_text(body.email, 320, "invalid_email")?;
    let site_name = required_text(body.site_name, 160, "invalid_site_name")?;
    let organization_name =
        required_text(body.organization_name, 200, "invalid_organization_name")?;
    let organization_slug = required_slug(body.organization_slug)?;
    let network = validate_network(&state, body.stellar_network)?;

    let mut tx = pool.begin().await.map_err(map_database_error)?;
    let already_completed = sqlx::query_scalar::<_, bool>(
        "SELECT setup_completed_at IS NOT NULL FROM site_settings WHERE id = 1 FOR UPDATE",
    )
    .fetch_one(&mut *tx)
    .await
    .map_err(map_database_error)?;
    if already_completed {
        return Err(ApiError::Conflict("setup_already_completed"));
    }

    let wallet_count = sqlx::query_scalar::<_, i64>(
        "SELECT count(*) FROM stellar_accounts WHERE user_id = $1 AND network = $2 AND verified_at IS NOT NULL",
    )
    .bind(body.user_id)
    .bind(&network)
    .fetch_one(&mut *tx)
    .await
    .map_err(map_database_error)?;
    if wallet_count == 0 {
        return Err(ApiError::InvalidRequest("verified_wallet_required"));
    }

    sqlx::query("UPDATE users SET display_name = $2, email = $3, updated_at = now() WHERE id = $1")
        .bind(body.user_id)
        .bind(&display_name)
        .bind(&email)
        .execute(&mut *tx)
        .await
        .map_err(map_database_error)?;

    let organization_id = Uuid::new_v4();
    sqlx::query(
        "INSERT INTO organizations (id, name, slug, created_by_user_id) VALUES ($1, $2, $3, $4)",
    )
    .bind(organization_id)
    .bind(&organization_name)
    .bind(&organization_slug)
    .bind(body.user_id)
    .execute(&mut *tx)
    .await
    .map_err(map_database_error)?;
    sqlx::query(
        "INSERT INTO organization_members (organization_id, user_id, role, status) VALUES ($1, $2, 'owner', 'active')",
    )
    .bind(organization_id)
    .bind(body.user_id)
    .execute(&mut *tx)
    .await
    .map_err(map_database_error)?;
    sqlx::query(
        "INSERT INTO site_administrators (user_id, role, status, granted_by_user_id) VALUES ($1, 'owner', 'active', $1)",
    )
    .bind(body.user_id)
    .execute(&mut *tx)
    .await
    .map_err(map_database_error)?;

    if let Some(integrations) = body.integrations {
        for integration in integrations {
            let provider = required_provider(integration.provider)?;
            if !integration.protected_value.starts_with("v1.") {
                return Err(ApiError::InvalidRequest("integration_value_not_protected"));
            }
            let value_suffix =
                optional_text(integration.value_suffix, 32, "invalid_integration_suffix")?;
            sqlx::query(
                "INSERT INTO integration_settings (id, provider, protected_value, value_suffix, updated_by_user_id) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (provider) DO UPDATE SET protected_value = EXCLUDED.protected_value, value_suffix = EXCLUDED.value_suffix, validation_status = 'not_validated', last_validated_at = NULL, updated_by_user_id = EXCLUDED.updated_by_user_id, updated_at = now()",
            )
            .bind(Uuid::new_v4())
            .bind(provider)
            .bind(integration.protected_value)
            .bind(value_suffix)
            .bind(body.user_id)
            .execute(&mut *tx)
            .await
            .map_err(map_database_error)?;
        }
    }

    sqlx::query(
        "UPDATE site_settings SET site_name = $1, stellar_network = $2, setup_completed_at = now(), setup_completed_by_user_id = $3, updated_at = now() WHERE id = 1",
    )
    .bind(site_name)
    .bind(network)
    .bind(body.user_id)
    .execute(&mut *tx)
    .await
    .map_err(map_database_error)?;
    write_audit(
        &mut tx,
        body.user_id,
        "site.setup.complete",
        json!({"organization_id": organization_id}),
    )
    .await?;
    tx.commit().await.map_err(map_database_error)?;

    Ok((
        StatusCode::CREATED,
        Json(CompleteSetupResponse {
            profile: load_profile(pool, body.user_id).await?,
            settings: load_site_settings(pool).await?,
        }),
    ))
}

async fn get_site_settings(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<SiteSettingsResponse>, ApiError> {
    require_internal(&state, &headers)?;
    let pool = database_pool(&state)?;
    let integrations = sqlx::query_as::<_, IntegrationMetadata>(
        "SELECT provider, value_suffix, validation_status, last_validated_at, updated_at FROM integration_settings ORDER BY provider",
    )
    .fetch_all(pool)
    .await
    .map_err(map_database_error)?;
    let settings = load_site_settings(pool).await?;
    Ok(Json(SiteSettingsResponse {
        mainnet_available: state.config.allow_mainnet && settings.mainnet_enabled,
        settings,
        integrations,
    }))
}

async fn update_site_settings(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(body): Json<UpdateSiteSettingsRequest>,
) -> Result<Json<SiteSettingsResponse>, ApiError> {
    require_internal(&state, &headers)?;
    let pool = database_pool(&state)?;
    require_site_admin(pool, body.actor_user_id).await?;
    let current = load_site_settings(pool).await?;
    let site_name = body
        .site_name
        .map(|value| required_text(value, 160, "invalid_site_name"))
        .transpose()?
        .unwrap_or(current.site_name);
    let network = body
        .stellar_network
        .map(|value| validate_network(&state, value))
        .transpose()?
        .unwrap_or(current.stellar_network);
    if network == "public" && !(state.config.allow_mainnet && current.mainnet_enabled) {
        return Err(ApiError::Forbidden);
    }

    let default_pageant_id = if body.clear_default_pageant.unwrap_or(false) {
        None
    } else {
        body.default_pageant_id.or(current.default_pageant_id)
    };
    if let Some(pageant_id) = default_pageant_id {
        let eligible = sqlx::query_scalar::<_, bool>(
            "SELECT EXISTS (SELECT 1 FROM pageants WHERE id = $1 AND status IN ('published', 'active'))",
        )
        .bind(pageant_id)
        .fetch_one(pool)
        .await
        .map_err(map_database_error)?;
        if !eligible {
            return Err(ApiError::InvalidRequest("hosted_pageant_not_published"));
        }
    }

    let selector_enabled = body
        .pageant_selector_enabled
        .unwrap_or(current.pageant_selector_enabled);
    let mut tx = pool.begin().await.map_err(map_database_error)?;
    sqlx::query(
        "UPDATE site_settings SET site_name = $1, stellar_network = $2, default_pageant_id = $3, pageant_selector_enabled = $4, updated_at = now() WHERE id = 1",
    )
    .bind(site_name)
    .bind(network)
    .bind(default_pageant_id)
    .bind(selector_enabled)
    .execute(&mut *tx)
    .await
    .map_err(map_database_error)?;
    write_audit(
        &mut tx,
        body.actor_user_id,
        "site.settings.update",
        json!({
            "default_pageant_id": default_pageant_id,
            "pageant_selector_enabled": selector_enabled
        }),
    )
    .await?;
    tx.commit().await.map_err(map_database_error)?;
    get_site_settings(State(state), headers).await
}

async fn login_or_create_account(
    tx: &mut Transaction<'_, Postgres>,
    network: &str,
    address: &str,
) -> Result<Uuid, ApiError> {
    if let Some(user_id) = sqlx::query_scalar::<_, Uuid>(
        "SELECT user_id FROM stellar_accounts WHERE network = $1 AND address = $2",
    )
    .bind(network)
    .bind(address)
    .fetch_optional(&mut **tx)
    .await
    .map_err(map_database_error)?
    {
        sqlx::query(
            "UPDATE stellar_accounts SET verified_at = COALESCE(verified_at, now()) WHERE network = $1 AND address = $2",
        )
        .bind(network)
        .bind(address)
        .execute(&mut **tx)
        .await
        .map_err(map_database_error)?;
        return Ok(user_id);
    }

    let user_id = Uuid::new_v4();
    let wallet_id = Uuid::new_v4();
    let display_name = format!("CrownFi user {}", suffix(address));
    sqlx::query("INSERT INTO users (id, display_name) VALUES ($1, $2)")
        .bind(user_id)
        .bind(display_name)
        .execute(&mut **tx)
        .await
        .map_err(map_database_error)?;
    sqlx::query(
        "INSERT INTO stellar_accounts (id, user_id, network, address, is_primary, verified_at) VALUES ($1, $2, $3, $4, true, now())",
    )
    .bind(wallet_id)
    .bind(user_id)
    .bind(network)
    .bind(address)
    .execute(&mut **tx)
    .await
    .map_err(map_database_error)?;
    Ok(user_id)
}

async fn link_wallet(
    tx: &mut Transaction<'_, Postgres>,
    user_id: Uuid,
    network: &str,
    address: &str,
) -> Result<(), ApiError> {
    ensure_user_exists_tx(tx, user_id).await?;
    if let Some(existing_user_id) = sqlx::query_scalar::<_, Uuid>(
        "SELECT user_id FROM stellar_accounts WHERE network = $1 AND address = $2",
    )
    .bind(network)
    .bind(address)
    .fetch_optional(&mut **tx)
    .await
    .map_err(map_database_error)?
    {
        if existing_user_id == user_id {
            return Ok(());
        }
        return Err(ApiError::Conflict("wallet_already_linked"));
    }
    let has_primary = sqlx::query_scalar::<_, bool>(
        "SELECT EXISTS (SELECT 1 FROM stellar_accounts WHERE user_id = $1 AND network = $2 AND is_primary)",
    )
    .bind(user_id)
    .bind(network)
    .fetch_one(&mut **tx)
    .await
    .map_err(map_database_error)?;
    sqlx::query(
        "INSERT INTO stellar_accounts (id, user_id, network, address, is_primary, verified_at) VALUES ($1, $2, $3, $4, $5, now())",
    )
    .bind(Uuid::new_v4())
    .bind(user_id)
    .bind(network)
    .bind(address)
    .bind(!has_primary)
    .execute(&mut **tx)
    .await
    .map_err(map_database_error)?;
    Ok(())
}

async fn load_profile(pool: &PgPool, user_id: Uuid) -> Result<AccountProfile, ApiError> {
    let user = sqlx::query_as::<_, UserRecord>(
        "SELECT id, display_name, email, status, created_at, updated_at FROM users WHERE id = $1",
    )
    .bind(user_id)
    .fetch_optional(pool)
    .await
    .map_err(map_database_error)?
    .ok_or(ApiError::NotFound)?;
    let site_role = sqlx::query_scalar::<_, String>(
        "SELECT role FROM site_administrators WHERE user_id = $1 AND status = 'active'",
    )
    .bind(user_id)
    .fetch_optional(pool)
    .await
    .map_err(map_database_error)?;
    let wallets = sqlx::query_as::<_, WalletRecord>(
        "SELECT id, network, address, is_primary, verified_at, created_at FROM stellar_accounts WHERE user_id = $1 ORDER BY is_primary DESC, created_at",
    )
    .bind(user_id)
    .fetch_all(pool)
    .await
    .map_err(map_database_error)?;
    let organization_roles = sqlx::query_as::<_, OrganizationRoleRecord>(
        "SELECT om.organization_id, o.name AS organization_name, o.slug AS organization_slug, om.role FROM organization_members om JOIN organizations o ON o.id = om.organization_id WHERE om.user_id = $1 AND om.status = 'active' AND o.status <> 'archived' ORDER BY o.name",
    )
    .bind(user_id)
    .fetch_all(pool)
    .await
    .map_err(map_database_error)?;
    Ok(AccountProfile {
        id: user.id,
        display_name: user.display_name,
        email: user.email,
        status: user.status,
        site_role,
        wallets,
        organization_roles,
        created_at: user.created_at,
        updated_at: user.updated_at,
    })
}

async fn load_site_settings(pool: &PgPool) -> Result<SiteSettingsRecord, ApiError> {
    sqlx::query_as::<_, SiteSettingsRecord>(
        "SELECT site_name, stellar_network, mainnet_enabled, default_pageant_id, pageant_selector_enabled, setup_completed_at, setup_completed_by_user_id, updated_at FROM site_settings WHERE id = 1",
    )
    .fetch_one(pool)
    .await
    .map_err(map_database_error)
}

async fn require_site_admin(pool: &PgPool, user_id: Uuid) -> Result<(), ApiError> {
    let allowed = sqlx::query_scalar::<_, bool>(
        "SELECT EXISTS (SELECT 1 FROM site_administrators WHERE user_id = $1 AND status = 'active' AND role IN ('owner', 'admin'))",
    )
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
    let valid = value.len() == 56
        && value.starts_with('G')
        && value
            .chars()
            .skip(1)
            .all(|character| character.is_ascii_uppercase() || ('2'..='7').contains(&character));
    if valid {
        Ok(value)
    } else {
        Err(ApiError::InvalidRequest("invalid_stellar_address"))
    }
}

fn validate_network(state: &AppState, value: String) -> Result<String, ApiError> {
    let value = value.trim().to_ascii_lowercase();
    match value.as_str() {
        "testnet" => Ok(value),
        "public" if state.config.allow_mainnet => Ok(value),
        "public" => Err(ApiError::Forbidden),
        _ => Err(ApiError::InvalidRequest("invalid_stellar_network")),
    }
}

fn validate_purpose(value: String) -> Result<String, ApiError> {
    let value = value.trim().to_ascii_lowercase();
    if ["login", "link", "setup"].contains(&value.as_str()) {
        Ok(value)
    } else {
        Err(ApiError::InvalidRequest("invalid_challenge_purpose"))
    }
}

fn required_provider(value: String) -> Result<String, ApiError> {
    let value = value.trim().to_ascii_lowercase();
    let valid = !value.is_empty()
        && value.len() <= 80
        && value.split('-').all(|part| {
            !part.is_empty()
                && part
                    .chars()
                    .all(|character| character.is_ascii_lowercase() || character.is_ascii_digit())
        });
    if valid {
        Ok(value)
    } else {
        Err(ApiError::InvalidRequest("invalid_integration_provider"))
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

async fn ensure_user_exists(pool: &PgPool, user_id: Uuid) -> Result<(), ApiError> {
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

async fn ensure_user_exists_tx(
    tx: &mut Transaction<'_, Postgres>,
    user_id: Uuid,
) -> Result<(), ApiError> {
    let exists = sqlx::query_scalar::<_, bool>("SELECT EXISTS (SELECT 1 FROM users WHERE id = $1)")
        .bind(user_id)
        .fetch_one(&mut **tx)
        .await
        .map_err(map_database_error)?;
    if exists {
        Ok(())
    } else {
        Err(ApiError::NotFound)
    }
}

async fn write_audit(
    tx: &mut Transaction<'_, Postgres>,
    actor_user_id: Uuid,
    action: &str,
    metadata: serde_json::Value,
) -> Result<(), ApiError> {
    sqlx::query(
        "INSERT INTO audit_logs (id, actor_user_id, action, entity_type, entity_id, metadata) VALUES ($1, $2, $3, 'user', $2, $4)",
    )
    .bind(Uuid::new_v4())
    .bind(actor_user_id)
    .bind(action)
    .bind(metadata)
    .execute(&mut **tx)
    .await
    .map_err(map_database_error)?;
    Ok(())
}

fn suffix(value: &str) -> String {
    value
        .chars()
        .rev()
        .take(6)
        .collect::<String>()
        .chars()
        .rev()
        .collect()
}

fn map_database_error(error: sqlx::Error) -> ApiError {
    if let Some(database_error) = error.as_database_error() {
        let code = database_error.code().map(|code| code.into_owned());
        return match code.as_deref() {
            Some("23505") => ApiError::Conflict("resource_already_exists"),
            Some("23503") => ApiError::InvalidRequest("related_resource_not_found"),
            Some("23514") | Some("22P02") => ApiError::InvalidRequest("database_constraint_failed"),
            _ => {
                tracing::error!(error = %error, "identity database operation failed");
                ApiError::Database
            }
        };
    }
    tracing::error!(error = %error, "identity database operation failed");
    ApiError::Database
}
