use axum::{
    extract::{Request, State},
    http::Method,
    middleware::Next,
    response::Response,
};
use sqlx::{PgPool, Postgres, Transaction};
use tokio::time::{sleep, Duration, Instant};
use uuid::Uuid;

use crate::{error::ApiError, state::AppState};

const COMPLETE_MEDIA_PREFIX: &str = "/admin/platform/media/";
const COMPLETE_MEDIA_SUFFIX: &str = "/complete";
const LOCK_RETRY_DELAY: Duration = Duration::from_millis(25);
const LOCK_WAIT_TIMEOUT: Duration = Duration::from_secs(30);

pub async fn serialize(
    State(state): State<AppState>,
    request: Request,
    next: Next,
) -> Result<Response, ApiError> {
    let Some(media_asset_id) = completion_asset_id(request.method(), request.uri().path()) else {
        return Ok(next.run(request).await);
    };

    let pool = state
        .database
        .as_ref()
        .ok_or(ApiError::ServiceUnavailable("database_not_configured"))?;
    let lock_transaction = acquire_completion_lock(pool, media_asset_id).await?;

    let response = next.run(request).await;
    if let Err(error) = lock_transaction.commit().await {
        tracing::error!(
            %error,
            %media_asset_id,
            "failed to release media completion advisory lock cleanly"
        );
    }

    Ok(response)
}

async fn acquire_completion_lock(
    pool: &PgPool,
    media_asset_id: Uuid,
) -> Result<Transaction<'static, Postgres>, ApiError> {
    let deadline = Instant::now() + LOCK_WAIT_TIMEOUT;

    loop {
        let mut transaction = pool.begin().await.map_err(|error| {
            tracing::error!(
                %error,
                %media_asset_id,
                "failed to begin media completion lock transaction"
            );
            ApiError::Database
        })?;
        let acquired = sqlx::query_scalar::<_, bool>(
            "SELECT pg_try_advisory_xact_lock(hashtextextended($1, 0::bigint))",
        )
        .bind(format!("crownfi:media-completion:{media_asset_id}"))
        .fetch_one(&mut *transaction)
        .await
        .map_err(|error| {
            tracing::error!(
                %error,
                %media_asset_id,
                "failed to attempt media completion advisory lock"
            );
            ApiError::Database
        })?;

        if acquired {
            return Ok(transaction);
        }

        transaction.rollback().await.map_err(|error| {
            tracing::error!(
                %error,
                %media_asset_id,
                "failed to release media completion lock retry transaction"
            );
            ApiError::Database
        })?;
        if Instant::now() >= deadline {
            return Err(ApiError::Conflict("media_completion_busy"));
        }
        sleep(LOCK_RETRY_DELAY).await;
    }
}

fn completion_asset_id(method: &Method, path: &str) -> Option<Uuid> {
    if *method != Method::POST {
        return None;
    }

    let asset_id = path
        .strip_prefix(COMPLETE_MEDIA_PREFIX)?
        .strip_suffix(COMPLETE_MEDIA_SUFFIX)?;
    if asset_id.is_empty() || asset_id.contains('/') {
        return None;
    }

    Uuid::parse_str(asset_id).ok()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn recognizes_only_the_media_completion_post_route() {
        let id = Uuid::new_v4();
        let path = format!("{COMPLETE_MEDIA_PREFIX}{id}{COMPLETE_MEDIA_SUFFIX}");

        assert_eq!(completion_asset_id(&Method::POST, &path), Some(id));
        assert_eq!(completion_asset_id(&Method::GET, &path), None);
        assert_eq!(
            completion_asset_id(&Method::POST, &format!("{path}/extra")),
            None
        );
        assert_eq!(
            completion_asset_id(&Method::POST, "/admin/platform/media/not-a-uuid/complete"),
            None
        );
    }
}
