mod app;
mod config;
mod database;
mod error;
mod markets;
mod models;
mod state;

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
    let command = std::env::args()
        .nth(1)
        .unwrap_or_else(|| "serve".to_string());

    if command == "migrate" {
        database::migrate(&config).await?;
        tracing::info!("SQLx migrations applied successfully");
        return Ok(());
    }

    if command != "serve" {
        return Err(io::Error::new(
            io::ErrorKind::InvalidInput,
            format!("unknown crownfi-api command: {command}; expected serve or migrate"),
        )
        .into());
    }

    let addr: SocketAddr = config.bind_addr.parse()?;
    let state = AppState::new(config).await?;
    let app = router(state.clone()).merge(markets::router().with_state(state));

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
