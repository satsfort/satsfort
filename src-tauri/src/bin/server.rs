use std::net::SocketAddr;
use std::sync::Arc;

use tokio::sync::RwLock;
use tracing_subscriber::EnvFilter;

use sats_fort_app_lib::server::{build_router, ServerConfig};
use sats_fort_app_lib::structs::AppState;

#[tokio::main]
async fn main() {
    let env_filter = EnvFilter::try_from_env("SATSFORT_LOG").unwrap_or_else(|_| EnvFilter::new("info"));
    tracing_subscriber::fmt().with_env_filter(env_filter).init();

    let config = ServerConfig::from_env();

    if let Err(error) = std::fs::create_dir_all(&config.data_dir) {
        eprintln!(
            "[satsfort-server] failed to prepare data dir {}: {error}",
            config.data_dir.display()
        );
        std::process::exit(1);
    }

    let app_state = AppState {
        pool: Arc::new(RwLock::new(None)),
        master_password: Arc::new(RwLock::new(None)),
    };

    let router = build_router(app_state, config.clone());

    let addr = SocketAddr::from(([0, 0, 0, 0], config.port));
    let listener = match tokio::net::TcpListener::bind(addr).await {
        Ok(listener) => listener,
        Err(error) => {
            eprintln!("[satsfort-server] failed to bind {addr}: {error}");
            std::process::exit(1);
        }
    };

    tracing::info!(
        port = config.port,
        data_dir = %config.data_dir.display(),
        static_dir = %config.static_dir.display(),
        "satsfort-server listening"
    );

    if let Err(error) = axum::serve(listener, router).await {
        eprintln!("[satsfort-server] server error: {error}");
        std::process::exit(1);
    }
}
