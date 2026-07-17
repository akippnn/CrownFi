use std::{collections::HashMap, sync::Arc};

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

use crate::{app::require_admin, error::ApiError, state::AppState, storage::MediaStore};

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/platform/media/:media_asset_id", get(get_media_asset))
        .route(
            "/platform/pageant-contestants/:pageant_contestant_id/media",
            get(list_contestant_media),
        )
        .route(
            "/admin/platform/organizations/:organization_id/media/upload-intents",
            post(create_upload_intent),
        )
        .route(
            "/admin/platform/media/:media_asset_id/complete",
            post(complete_upload),
        )
        .route(
            "/admin/platform/pageant-contestants/:pageant_contestant_id/media",
            post(attach_contestant_media),
        )
}

#[derive(Debug, Clone, FromRow)]
struct MediaAssetRow {
    id: Uuid,
    organization_id: Uuid,
    uploaded_by_user_id: Uuid,
    storage_provider: String,
    bucket: String,
    object_key: String,
    original_filename: String,
    content_type: String,
    byte_size: i64,
    width: Option<i32>,
    height: Option<i32>,
    sha256: String,
    visibility: String,
    status: String,
    alt_text: Option<String>,
    created_at: OffsetDateTime,
    updated_at: OffsetDateTime,
}

#[derive(Debug, Clone, Serialize)]
pub struct MediaAssetResponse {
    pub id: Uuid,
    pub organization_id: Uuid,
    pub uploaded_by_user_id: Uuid,
    pub storage_provider: String,
    pub bucket: String,
    pub object_key: String,
    pub original_filename: String,
    pub content_type: String,
    pub byte_size: i64,
    pub width: Option<i32>,
    pub height: Option<i32>,
    pub sha256: String,
    pub visibility: String,
    pub status: String,
    pub alt_text: Option<String>,
    pub delivery_url: Option<String>,
    pub created_at: OffsetDateTime,
    pub updated_at: OffsetDateTime,
}

impl MediaAssetResponse {
    fn from_row(state: &AppState, row: MediaAssetRow) -> Self {
        let delivery_url = if row.status == "ready" && row.visibility != "private" {
            media_delivery_url(state, &row.object_key)
        } else {
            None
        };

        Self {
            id: row.id,
            organization_id: row.organization_id,
            uploaded_by_user_id: row.uploaded_by_user_id,
            storage_provider: row.storage_provider,
            bucket: row.bucket,
            object_key: row.object_key,
            original_filename: row.original_filename,
            content_type: row.content_type,
            byte_size: row.byte_size,
            width: row.width,
            height: row.height,
            sha256: row.sha256,
            visibility: row.visibility,
            status: row.status,
            alt_text: row.alt_text,
            delivery_url,
            created_at: row.created_at,
            updated_at: row.updated_at,
        }
    }
}

#[derive(Debug, Deserialize)]
pub struct CreateUploadIntentRequest {
    pub original_filename: String,
    pub content_type: String,
    pub byte_size: i64,
    pub sha256: String,
    pub visibility: Option<String>,
    pub alt_text: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct PresignedUploadResponse {
    pub method: &'static str,
    pub url: String,
    pub headers: HashMap<String, String>,
    pub expires_in_seconds: u64,
}

#[derive(Debug, Serialize)]
pub struct CreateUploadIntentResponse {
    pub asset: MediaAssetResponse,
    pub upload: PresignedUploadResponse,
}

#[derive(Debug, Deserialize)]
pub struct CompleteUploadRequest {
    pub width: Option<i32>,
    pub height: Option<i32>,
}

#[derive(Debug, Deserialize)]
pub struct AttachContestantMediaRequest {
    pub media_asset_id: Uuid,
    pub role: String,
    pub caption: Option<String>,
    pub sort_order: Option<i32>,
}

#[derive(Debug, Clone, FromRow)]
struct ContestantMediaRow {
    attachment_id: Uuid,
    pageant_contestant_id: Uuid,
    role: String,
    caption: Option<String>,
    sort_order: i32,
    created_at: OffsetDateTime,
    media_asset_id: Uuid,
    organization_id: Uuid,
    uploaded_by_user_id: Uuid,
    storage_provider: String,
    bucket: String,
    object_key: String,
    original_filename: String,
    content_type: String,
    byte_size: i64,
    width: Option<i32>,
    height: Option<i32>,
    sha256: String,
    visibility: String,
    status: String,
    alt_text: Option<String>,
    media_created_at: OffsetDateTime,
    media_updated_at: OffsetDateTime,
}

#[derive(Debug, Serialize)]
pub struct ContestantMediaResponse {
    pub attachment_id: Uuid,
    pub pageant_contestant_id: Uuid,
    pub role: String,
    pub caption: Option<String>,
    pub sort_order: i32,
    pub created_at: OffsetDateTime,
    pub asset: MediaAssetResponse,
}

impl ContestantMediaResponse {
    fn from_row(state: &AppState, row: ContestantMediaRow) -> Self {
        let asset = MediaAssetRow {
            id: row.media_asset_id,
            organization_id: row.organization_id,
            uploaded_by_user_id: row.uploaded_by_user_id,
            storage_provider: row.storage_provider,
            bucket: row.bucket,
            object_key: row.object_key,
            original_filename: row.original_filename,
            content_type: row.content_type,
            byte_size: row.byte_size,
            width: row.width,
            height: row.height,
            sha256: row.sha256,
            visibility: row.visibility,
            status: row.status,
            alt_text: row.alt_text,
            created_at: row.media_created_at,
            updated_at: row.media_updated_at,
        };

        Self {
            attachment_id: row.attachment_id,
            pageant_contestant_id: row.pageant_contestant_id,
            role: row.role,
            caption: row.caption,
            sort_order: row.sort_order,
            created_at: row.created_at,
            asset: MediaAssetResponse::from_row(state, asset),
        }
    }
}

async fn create_upload_intent(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(organization_id): Path<Uuid>,
    Json(body): Json<CreateUploadIntentRequest>,
) -> Result<(StatusCode, Json<CreateUploadIntentResponse>), ApiError> {
    let actor_user_id = require_admin_actor(&state, &headers)?;
    let pool = database_pool(&state)?;
    require_organization_editor(pool, organization_id, actor_user_id).await?;
    let store = media_store(&state)?;

    let original_filename = validate_filename(body.original_filename)?;
    let content_type = validate_image_content_type(body.content_type)?;
    if body.byte_size <= 0 || body.byte_size > state.config.r2_max_image_bytes {
        return Err(ApiError::InvalidRequest("invalid_media_byte_size"));
    }
    let sha256 = validate_sha256(body.sha256)?;
    let visibility = validate_visibility(body.visibility)?;
    let alt_text = optional_text(body.alt_text, 500, "invalid_media_alt_text")?;
    let media_asset_id = Uuid::new_v4();
    let extension = extension_for_content_type(&content_type);
    let object_key =
        format!("organizations/{organization_id}/media/{media_asset_id}/original.{extension}");

    let authorization = store
        .presign_upload(&object_key, &content_type, &sha256)
        .await
        .map_err(|error| {
            tracing::error!(%error, "failed to authorize R2 media upload");
            ApiError::Storage("upload_authorization_failed")
        })?;

    let mut tx = pool.begin().await.map_err(map_database_error)?;
    let asset = sqlx::query_as::<_, MediaAssetRow>(
        "INSERT INTO media_assets (id, organization_id, uploaded_by_user_id, bucket, object_key, original_filename, content_type, byte_size, sha256, visibility, alt_text) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id, organization_id, uploaded_by_user_id, storage_provider, bucket, object_key, original_filename, content_type, byte_size, width, height, sha256, visibility, status, alt_text, created_at, updated_at",
    )
    .bind(media_asset_id)
    .bind(organization_id)
    .bind(actor_user_id)
    .bind(store.bucket())
    .bind(&object_key)
    .bind(original_filename)
    .bind(&content_type)
    .bind(body.byte_size)
    .bind(&sha256)
    .bind(visibility)
    .bind(alt_text)
    .fetch_one(&mut *tx)
    .await
    .map_err(map_database_error)?;

    write_audit(
        &mut tx,
        Some(organization_id),
        Some(actor_user_id),
        "media.upload_intent.create",
        "media_asset",
        Some(media_asset_id),
        serde_json::json!({
            "content_type": content_type,
            "byte_size": body.byte_size,
            "sha256": sha256,
        }),
    )
    .await?;
    tx.commit().await.map_err(map_database_error)?;

    Ok((
        StatusCode::CREATED,
        Json(CreateUploadIntentResponse {
            asset: MediaAssetResponse::from_row(&state, asset),
            upload: PresignedUploadResponse {
                method: "PUT",
                url: authorization.url,
                headers: authorization.headers,
                expires_in_seconds: authorization.expires_in_seconds,
            },
        }),
    ))
}

async fn complete_upload(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(media_asset_id): Path<Uuid>,
    Json(body): Json<CompleteUploadRequest>,
) -> Result<Json<MediaAssetResponse>, ApiError> {
    let actor_user_id = require_admin_actor(&state, &headers)?;
    let pool = database_pool(&state)?;
    let store = media_store(&state)?;
    validate_dimensions(body.width, body.height)?;

    let pending = fetch_media_asset(pool, media_asset_id).await?;
    require_organization_editor(pool, pending.organization_id, actor_user_id).await?;
    if pending.status == "ready" {
        return Ok(Json(MediaAssetResponse::from_row(&state, pending)));
    }
    if pending.status != "pending" {
        return Err(ApiError::Conflict("media_asset_not_pending"));
    }

    let stored = store
        .head_object(&pending.object_key)
        .await
        .map_err(|error| {
            tracing::warn!(%error, media_asset_id = %pending.id, "R2 media object is not ready");
            ApiError::Storage("uploaded_object_not_found")
        })?;

    let object_matches = stored.content_length == pending.byte_size
        && stored.content_type.as_deref() == Some(pending.content_type.as_str())
        && stored.sha256_metadata.as_deref() == Some(pending.sha256.as_str());
    if !object_matches {
        sqlx::query("UPDATE media_assets SET status = 'failed', updated_at = now() WHERE id = $1")
            .bind(media_asset_id)
            .execute(pool)
            .await
            .map_err(map_database_error)?;
        if let Err(error) = store.delete_object(&pending.object_key).await {
            tracing::warn!(%error, media_asset_id = %pending.id, "failed to remove invalid R2 object");
        }
        return Err(ApiError::Conflict("uploaded_object_mismatch"));
    }

    let mut tx = pool.begin().await.map_err(map_database_error)?;
    let ready = sqlx::query_as::<_, MediaAssetRow>(
        "UPDATE media_assets SET status = 'ready', width = $2, height = $3, updated_at = now() WHERE id = $1 RETURNING id, organization_id, uploaded_by_user_id, storage_provider, bucket, object_key, original_filename, content_type, byte_size, width, height, sha256, visibility, status, alt_text, created_at, updated_at",
    )
    .bind(media_asset_id)
    .bind(body.width)
    .bind(body.height)
    .fetch_one(&mut *tx)
    .await
    .map_err(map_database_error)?;

    write_audit(
        &mut tx,
        Some(ready.organization_id),
        Some(actor_user_id),
        "media.upload.complete",
        "media_asset",
        Some(media_asset_id),
        serde_json::json!({"etag": stored.e_tag}),
    )
    .await?;
    tx.commit().await.map_err(map_database_error)?;

    Ok(Json(MediaAssetResponse::from_row(&state, ready)))
}

async fn get_media_asset(
    State(state): State<AppState>,
    Path(media_asset_id): Path<Uuid>,
) -> Result<Json<MediaAssetResponse>, ApiError> {
    let pool = database_pool(&state)?;
    let asset = sqlx::query_as::<_, MediaAssetRow>(
        "SELECT id, organization_id, uploaded_by_user_id, storage_provider, bucket, object_key, original_filename, content_type, byte_size, width, height, sha256, visibility, status, alt_text, created_at, updated_at FROM media_assets WHERE id = $1 AND status = 'ready' AND visibility IN ('unlisted', 'public')",
    )
    .bind(media_asset_id)
    .fetch_optional(pool)
    .await
    .map_err(map_database_error)?
    .ok_or(ApiError::NotFound)?;
    Ok(Json(MediaAssetResponse::from_row(&state, asset)))
}

async fn attach_contestant_media(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(pageant_contestant_id): Path<Uuid>,
    Json(body): Json<AttachContestantMediaRequest>,
) -> Result<(StatusCode, Json<ContestantMediaResponse>), ApiError> {
    let actor_user_id = require_admin_actor(&state, &headers)?;
    let pool = database_pool(&state)?;
    let organization_id = organization_for_pageant_contestant(pool, pageant_contestant_id).await?;
    require_organization_editor(pool, organization_id, actor_user_id).await?;
    let role = validate_media_role(body.role)?;
    let caption = optional_text(body.caption, 2_000, "invalid_media_caption")?;
    let asset = fetch_media_asset(pool, body.media_asset_id).await?;
    if asset.organization_id != organization_id {
        return Err(ApiError::Forbidden);
    }
    if asset.status != "ready" {
        return Err(ApiError::Conflict("media_asset_not_ready"));
    }

    let attachment_id = Uuid::new_v4();
    let mut tx = pool.begin().await.map_err(map_database_error)?;
    if role == "portrait" {
        sqlx::query("DELETE FROM contestant_media WHERE pageant_contestant_id = $1 AND role = 'portrait'")
            .bind(pageant_contestant_id)
            .execute(&mut *tx)
            .await
            .map_err(map_database_error)?;
    }
    sqlx::query("INSERT INTO contestant_media (id, pageant_contestant_id, media_asset_id, role, caption, sort_order) VALUES ($1, $2, $3, $4, $5, $6)")
        .bind(attachment_id)
        .bind(pageant_contestant_id)
        .bind(body.media_asset_id)
        .bind(&role)
        .bind(caption)
        .bind(body.sort_order.unwrap_or(0))
        .execute(&mut *tx)
        .await
        .map_err(map_database_error)?;

    let attachment = fetch_contestant_media(&mut tx, attachment_id).await?;
    write_audit(
        &mut tx,
        Some(organization_id),
        Some(actor_user_id),
        "contestant_media.attach",
        "contestant_media",
        Some(attachment_id),
        serde_json::json!({
            "pageant_contestant_id": pageant_contestant_id,
            "media_asset_id": body.media_asset_id,
            "role": role,
        }),
    )
    .await?;
    tx.commit().await.map_err(map_database_error)?;

    Ok((
        StatusCode::CREATED,
        Json(ContestantMediaResponse::from_row(&state, attachment)),
    ))
}

async fn list_contestant_media(
    State(state): State<AppState>,
    Path(pageant_contestant_id): Path<Uuid>,
) -> Result<Json<Vec<ContestantMediaResponse>>, ApiError> {
    let pool = database_pool(&state)?;
    let rows = sqlx::query_as::<_, ContestantMediaRow>(CONTESTANT_MEDIA_SELECT)
        .bind(pageant_contestant_id)
        .fetch_all(pool)
        .await
        .map_err(map_database_error)?;
    Ok(Json(
        rows.into_iter()
            .map(|row| ContestantMediaResponse::from_row(&state, row))
            .collect(),
    ))
}

const CONTESTANT_MEDIA_SELECT: &str = "SELECT cm.id AS attachment_id, cm.pageant_contestant_id, cm.role, cm.caption, cm.sort_order, cm.created_at, ma.id AS media_asset_id, ma.organization_id, ma.uploaded_by_user_id, ma.storage_provider, ma.bucket, ma.object_key, ma.original_filename, ma.content_type, ma.byte_size, ma.width, ma.height, ma.sha256, ma.visibility, ma.status, ma.alt_text, ma.created_at AS media_created_at, ma.updated_at AS media_updated_at FROM contestant_media cm JOIN media_assets ma ON ma.id = cm.media_asset_id WHERE cm.pageant_contestant_id = $1 AND ma.status = 'ready' AND ma.visibility IN ('unlisted', 'public') ORDER BY cm.sort_order, cm.created_at";

async fn fetch_media_asset(pool: &PgPool, media_asset_id: Uuid) -> Result<MediaAssetRow, ApiError> {
    sqlx::query_as::<_, MediaAssetRow>(
        "SELECT id, organization_id, uploaded_by_user_id, storage_provider, bucket, object_key, original_filename, content_type, byte_size, width, height, sha256, visibility, status, alt_text, created_at, updated_at FROM media_assets WHERE id = $1",
    )
    .bind(media_asset_id)
    .fetch_optional(pool)
    .await
    .map_err(map_database_error)?
    .ok_or(ApiError::NotFound)
}

async fn fetch_contestant_media(
    tx: &mut Transaction<'_, Postgres>,
    attachment_id: Uuid,
) -> Result<ContestantMediaRow, ApiError> {
    sqlx::query_as::<_, ContestantMediaRow>(
        "SELECT cm.id AS attachment_id, cm.pageant_contestant_id, cm.role, cm.caption, cm.sort_order, cm.created_at, ma.id AS media_asset_id, ma.organization_id, ma.uploaded_by_user_id, ma.storage_provider, ma.bucket, ma.object_key, ma.original_filename, ma.content_type, ma.byte_size, ma.width, ma.height, ma.sha256, ma.visibility, ma.status, ma.alt_text, ma.created_at AS media_created_at, ma.updated_at AS media_updated_at FROM contestant_media cm JOIN media_assets ma ON ma.id = cm.media_asset_id WHERE cm.id = $1",
    )
    .bind(attachment_id)
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

fn media_store(state: &AppState) -> Result<Arc<MediaStore>, ApiError> {
    state
        .media_store
        .as_ref()
        .cloned()
        .ok_or(ApiError::ServiceUnavailable("r2_not_configured"))
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

async fn organization_for_pageant_contestant(
    pool: &PgPool,
    pageant_contestant_id: Uuid,
) -> Result<Uuid, ApiError> {
    sqlx::query_scalar::<_, Uuid>(
        "SELECT p.organization_id FROM pageant_contestants pc JOIN pageants p ON p.id = pc.pageant_id WHERE pc.id = $1",
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
    sqlx::query("INSERT INTO audit_logs (id, organization_id, actor_user_id, action, entity_type, entity_id, metadata) VALUES ($1, $2, $3, $4, $5, $6, $7)")
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

fn validate_filename(value: String) -> Result<String, ApiError> {
    let value = value.trim().to_string();
    if value.is_empty()
        || value.chars().count() > 255
        || value.contains('/')
        || value.contains('\\')
        || value.chars().any(char::is_control)
    {
        Err(ApiError::InvalidRequest("invalid_media_filename"))
    } else {
        Ok(value)
    }
}

fn validate_image_content_type(value: String) -> Result<String, ApiError> {
    let value = value.trim().to_ascii_lowercase();
    if matches!(
        value.as_str(),
        "image/jpeg" | "image/png" | "image/webp" | "image/avif" | "image/gif"
    ) {
        Ok(value)
    } else {
        Err(ApiError::InvalidRequest("unsupported_image_content_type"))
    }
}

fn extension_for_content_type(content_type: &str) -> &'static str {
    match content_type {
        "image/jpeg" => "jpg",
        "image/png" => "png",
        "image/webp" => "webp",
        "image/avif" => "avif",
        "image/gif" => "gif",
        _ => "bin",
    }
}

fn validate_sha256(value: String) -> Result<String, ApiError> {
    let value = value.trim().to_ascii_lowercase();
    if value.len() == 64 && value.chars().all(|character| character.is_ascii_hexdigit()) {
        Ok(value)
    } else {
        Err(ApiError::InvalidRequest("invalid_media_sha256"))
    }
}

fn validate_visibility(value: Option<String>) -> Result<String, ApiError> {
    let value = value.unwrap_or_else(|| "private".to_string());
    let value = value.trim().to_ascii_lowercase();
    if matches!(value.as_str(), "private" | "unlisted" | "public") {
        Ok(value)
    } else {
        Err(ApiError::InvalidRequest("invalid_media_visibility"))
    }
}

fn validate_media_role(value: String) -> Result<String, ApiError> {
    let value = value.trim().to_ascii_lowercase();
    if matches!(
        value.as_str(),
        "portrait" | "banner" | "gallery" | "section"
    ) {
        Ok(value)
    } else {
        Err(ApiError::InvalidRequest("invalid_contestant_media_role"))
    }
}

fn validate_dimensions(width: Option<i32>, height: Option<i32>) -> Result<(), ApiError> {
    if width.is_some_and(|value| value <= 0) || height.is_some_and(|value| value <= 0) {
        Err(ApiError::InvalidRequest("invalid_media_dimensions"))
    } else {
        Ok(())
    }
}

fn optional_text(
    value: Option<String>,
    max_len: usize,
    error: &'static str,
) -> Result<Option<String>, ApiError> {
    value
        .map(|value| {
            let value = value.trim().to_string();
            if value.is_empty() || value.chars().count() > max_len {
                Err(ApiError::InvalidRequest(error))
            } else {
                Ok(value)
            }
        })
        .transpose()
}

fn media_delivery_url(state: &AppState, object_key: &str) -> Option<String> {
    state
        .media_store
        .as_ref()
        .and_then(|store| store.delivery_url(object_key))
        .or_else(|| {
            state
                .config
                .r2_public_base_url
                .as_deref()
                .map(|base| format!("{}/{object_key}", base.trim_end_matches('/')))
        })
}

fn map_database_error(error: sqlx::Error) -> ApiError {
    if let Some(database_error) = error.as_database_error() {
        let code = database_error.code().map(|code| code.into_owned());
        return match code.as_deref() {
            Some("23505") => ApiError::Conflict("resource_already_exists"),
            Some("23503") => ApiError::InvalidRequest("related_resource_not_found"),
            Some("23514") | Some("22P02") => ApiError::InvalidRequest("database_constraint_failed"),
            _ => {
                tracing::error!(error = %error, "media database operation failed");
                ApiError::Database
            }
        };
    }

    tracing::error!(error = %error, "media database operation failed");
    ApiError::Database
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_svg_and_path_filenames() {
        assert!(validate_image_content_type("image/svg+xml".to_string()).is_err());
        assert!(validate_filename("../portrait.png".to_string()).is_err());
    }

    #[test]
    fn normalizes_sha256_and_visibility() {
        let hash = "A".repeat(64);
        assert_eq!(validate_sha256(hash).unwrap(), "a".repeat(64));
        assert_eq!(validate_visibility(None).unwrap(), "private");
    }
}
