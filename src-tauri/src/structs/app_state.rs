use sqlx::sqlite::SqlitePool;
use std::sync::Arc;
use tokio::sync::RwLock;

pub struct AppState {
    pub pool: Arc<RwLock<Option<SqlitePool>>>,
    pub master_password: Arc<RwLock<Option<String>>>,
}


