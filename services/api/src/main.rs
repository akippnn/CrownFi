mod app;
mod commerce;
mod config;
mod database;
mod error;
mod identity;
mod manage;
mod markets;
mod media;
mod models;
mod platform;
mod seed;
mod state;
mod storage;

use std::{io, net::SocketAddr};

use app::router;
use config::Config;
use state::AppState;
use tokio::net::TcpListener;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    tracing_subscriber::registry()
        .with(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "crownfi_api=info,tower_http=info".into()),
        )
        .with(tracing_subscriber::fmt::layer())
        .init();

    let config = Config::from_env();
    let mut args = std::env::args().skip(1);
    let command = args.next().unwrap_or_else(|| "serve".to_string());

    match command.as_str() {
        "migrate" => {
            database::migrate(&config).await?;
            tracing::info!("SQLx migrations applied successfully");
            return Ok(());
        }
        "seed" => {
            let profile = args.next().ok_or_else(|| {
                io::Error::new(
                    io::ErrorKind::InvalidInput,
                    "seed profile is required; expected: crownfi-api seed demo",
                )
            })?;
            if profile != "demo" {
                return Err(io::Error::new(
                    io::ErrorKind::InvalidInput,
                    format!("unknown seed profile: {profile}; expected demo"),
                )
                .into());
            }
            seed::seed_demo(&config).await?;
            tracing::info!(
                profile = "demo",
                "explicit CrownFi seed applied successfully"
            );
            return Ok(());
        }
        "serve" => {}
        _ => {
            return Err(io::Error::new(
                io::ErrorKind::InvalidInput,
                format!(
                    "unknown crownfi-api command: {command}; expected serve, migrate, or seed demo"
                ),
            )
            .into());
        }
    }

    let addr: SocketAddr = config.bind_addr.parse()?;
    let state = AppState::new(config).await?;
    let app = router(state.clone())
        .merge(identity::router().with_state(state.clone()))
        .merge(manage::router().with_state(state.clone()))
        .merge(markets::router().with_state(state.clone()))
        .merge(platform::router().with_state(state.clone()))
        .merge(media::router().with_state(state.clone()))
        .merge(commerce::router().with_state(state));

    tracing::info!(%addr, "starting CrownFi API");
    let listener = TcpListener::bind(addr).await?;
    axum::serve(listener, app)
        .with_graceful_shutdown(shutdown_signal())
        .await?;

    Ok(())
}

async fn shutdown_signal() {
    let ctrl_c = async {
        tokio::signal::ctrl_c()
            .await
            .expect("failed to install Ctrl+C handler");
    };

    #[cfg(unix)]
    let terminate = async {
        tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())
            .expect("failed to install signal handler")
            .recv()
            .await;
    };

    #[cfg(not(unix))]
    let terminate = std::future::pending::<()>();

    tokio::select! {
        _ = ctrl_c => {},
        _ = terminate => {},
    }
}
