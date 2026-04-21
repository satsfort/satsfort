#![allow(dead_code)]

use sqlx::sqlite::{SqliteConnectOptions, SqlitePool};
use sats_fort_app_lib::structs::AppState;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};
use tokio::sync::RwLock;

pub fn unique_test_db_path(test_name: &str) -> PathBuf {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("system clock before unix epoch")
        .as_nanos();

    let root = std::env::temp_dir().join("sats-fort-rust-tests");
    std::fs::create_dir_all(&root).expect("failed to create temporary rust test directory");

    let case_dir = root.join(format!("{test_name}-{nanos}"));
    std::fs::create_dir_all(&case_dir).expect("failed to create temporary test case directory");

    case_dir.join("tests.db")
}

pub async fn new_test_pool(db_path: &Path) -> SqlitePool {
    let options = SqliteConnectOptions::new()
        .filename(db_path)
        .create_if_missing(true);

    SqlitePool::connect_with(options)
        .await
        .expect("failed to open isolated test sqlite database")
}

pub async fn cleanup_test_db(pool: SqlitePool, db_path: &Path) {
    pool.close().await;

    let _ = std::fs::remove_file(db_path);
    let _ = std::fs::remove_file(db_path.with_file_name("tests.db-wal"));
    let _ = std::fs::remove_file(db_path.with_file_name("tests.db-shm"));

    if let Some(case_dir) = db_path.parent() {
        let _ = std::fs::remove_dir_all(case_dir);
    }
}

pub fn new_test_app_state() -> AppState {
    AppState {
        pool: Arc::new(RwLock::new(None)),
        master_password: Arc::new(RwLock::new(None)),
    }
}

pub async fn cleanup_state_and_files(state: &AppState, db_path: &Path) {
    let pool = {
        let mut lock = state.pool.write().await;
        lock.take()
    };
    if let Some(pool) = pool {
        pool.close().await;
    }

    let mut password_lock = state.master_password.write().await;
    *password_lock = None;
    drop(password_lock);

    let db_file_name = db_path.file_name().and_then(|name| name.to_str()).unwrap_or("tests.db");
    let _ = std::fs::remove_file(db_path);
    let _ = std::fs::remove_file(db_path.with_file_name(format!("{db_file_name}-wal")));
    let _ = std::fs::remove_file(db_path.with_file_name(format!("{db_file_name}-shm")));

    if let Some(case_dir) = db_path.parent() {
        let _ = std::fs::remove_dir_all(case_dir);
    }
}

pub async fn close_state_only(state: &AppState) {
    let pool = {
        let mut lock = state.pool.write().await;
        lock.take()
    };
    if let Some(pool) = pool {
        pool.close().await;
    }

    let mut password_lock = state.master_password.write().await;
    *password_lock = None;
}

