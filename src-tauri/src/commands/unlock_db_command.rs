use sqlx::sqlite::{SqliteConnectOptions, SqlitePool};
use tauri::{AppHandle, Manager, State};

use crate::structs::AppState;
use crate::utils::migrations::run_pending_migrations;
use crate::utils::sqlcipher::{log_unlock_failure, sqlcipher_pragma_key};

#[tauri::command]
pub async fn unlock_db(password: String, app: AppHandle, state: State<'_, AppState>) -> Result<(), String> {
    let app_data_dir = app.path().app_data_dir().map_err(|error| {
        log_unlock_failure(
            "resolve_app_data_dir",
            None,
            &format!("Unable to resolve app data directory: {error}"),
        );
        format!("Unable to resolve app data directory: {error}")
    })?;

    std::fs::create_dir_all(&app_data_dir).map_err(|error| {
        log_unlock_failure(
            "create_app_data_dir",
            Some(app_data_dir.as_path()),
            &format!("Unable to initialize app data directory: {error}"),
        );
        format!("Unable to initialize app data directory: {error}")
    })?;

    let db_path = app_data_dir.join("portfolio.db");
    let key_pragma = sqlcipher_pragma_key(&password);
    let options = SqliteConnectOptions::new()
        .filename(db_path.as_path())
        .pragma("key", key_pragma)
        .create_if_missing(true);

    let pool = SqlitePool::connect_with(options).await.map_err(|error| {
        log_unlock_failure("connect_with_key", Some(db_path.as_path()), &error.to_string());
        "Wrong password or database error".to_string()
    })?;

    sqlx::query("SELECT count(*) FROM sqlite_master")
        .execute(&pool)
        .await
        .map_err(|error| {
            log_unlock_failure("verify_cipher_key", Some(db_path.as_path()), &error.to_string());
            "Wrong password or database error".to_string()
        })?;

    run_pending_migrations(&pool, db_path.as_path()).await?;

    let mut lock = state.pool.write().await;
    *lock = Some(pool);
    drop(lock);

    let mut password_lock = state.master_password.write().await;
    *password_lock = Some(password);

    Ok(())
}

