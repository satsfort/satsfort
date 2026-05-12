use sqlx::sqlite::SqlitePool;
use std::sync::Arc;
use tokio::sync::RwLock;

#[derive(Clone)]
pub struct AppState {
    pub pool: Arc<RwLock<Option<SqlitePool>>>,
    pub master_password: Arc<RwLock<Option<String>>>,
}


