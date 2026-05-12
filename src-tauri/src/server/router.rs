use axum::{
    routing::{get, post},
    Router,
};
use tower_http::services::{ServeDir, ServeFile};
use tower_http::trace::TraceLayer;

use crate::structs::AppState;

use super::config::ServerConfig;
use super::handlers::{self, ServerState};
use super::proxy;

pub fn build_router(app_state: AppState, config: ServerConfig) -> Router {
    let state = ServerState {
        app_state,
        config: config.clone(),
    };

    let api = Router::new()
        .route("/unlock-db", post(handlers::unlock_db))
        .route("/lock-db", post(handlers::lock_db))
        .route("/vault-status", get(handlers::vault_status))
        .route("/change-vault-password", post(handlers::change_vault_password))
        .route("/wipe-local-data", post(handlers::wipe_local_data))
        .route("/db-execute", post(handlers::db_execute))
        .route("/db-select", post(handlers::db_select))
        .with_state(state)
        .route("/proxy", get(proxy::proxy_get));

    let index_file = config.static_dir.join("index.html");
    let static_service = ServeDir::new(&config.static_dir).fallback(ServeFile::new(index_file));

    Router::new()
        .nest("/api", api)
        .fallback_service(static_service)
        .layer(TraceLayer::new_for_http())
}
