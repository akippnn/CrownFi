use std::time::Duration;

use sqlx::{migrate::Migrator, postgres::PgPoolOptions, PgPool};

use crate::config::Config;

static MIGRATOR: Migrator = sqlx::migrate!("./migrations");

#[derive(Debug, thiserror::Error)]
pub enum DatabaseInitError {
    #[error("DATABASE_URL is required when CROWNFI_DATABASE_REQUIRED=true or when running migrations")]
    MissingDatabaseUrl,
    #[error("failed to connect to PostgreSQL")]
    Connect(#[source] sqlx::Error),
    #[error("failed to apply SQLx migrations")]
    Migrate(#[source] sqlx::migrate::MigrateError),
}

pub async fn connect(config: &Config) -> Result<Option<PgPool>, DatabaseInitError> {
    let Some(database_url) = config.database_url.as_deref() else {
        if config.database_required {
            return Err(DatabaseInitError::MissingDatabaseUrl);
        }
        return Ok(None);
    };

    connect_pool(config, database_url).await.map(Some)
}

pub async fn migrate(config: &Config) -> Result<(), DatabaseInitError> {
    let database_url = config
        .database_url
        .as_deref()
        .ok_or(DatabaseInitError::MissingDatabaseUrl)?;
    let pool = connect_pool(config, database_url).await?;

    MIGRATOR
        .run(&pool)
        .await
        .map_err(DatabaseInitError::Migrate)?;
    pool.close().await;
    Ok(())
}

pub async fn ping(pool: &PgPool) -> Result<(), sqlx::Error> {
    sqlx::query("SELECT 1").execute(pool).await.map(|_| ())
}

async fn connect_pool(config: &Config, database_url: &str) -> Result<PgPool, DatabaseInitError> {
    PgPoolOptions::new()
        .max_connections(config.database_max_connections)
        .acquire_timeout(Duration::from_secs(
            config.database_acquire_timeout_seconds,
        ))
        .connect(database_url)
        .await
        .map_err(DatabaseInitError::Connect)
}
