use tauri::{AppHandle, Manager, State};

use crate::structs::AppState;

pub async fn wipe_local_data_for_path(db_path: &std::path::Path, state: &AppState) -> Result<(), String> {
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

    let db_file_name = db_path
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or_else(|| "Invalid database path".to_string())?;
    let wal_name = format!("{db_file_name}-wal");
    let shm_name = format!("{db_file_name}-shm");

    let db_files = [
        db_path.to_path_buf(),
        db_path.with_file_name(wal_name),
        db_path.with_file_name(shm_name),
    ];

    for db_file in db_files {
        if !db_file.exists() {
            continue;
        }

        std::fs::remove_file(db_file.as_path()).map_err(|error| {
            format!(
                "Failed to remove local database file {}: {error}",
                db_file.display()
            )
        })?;
    }

    Ok(())
}

#[tauri::command]
pub async fn wipe_local_data(app: AppHandle, state: State<'_, AppState>) -> Result<(), String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("Unable to resolve app data directory: {error}"))?;
    let db_path = app_data_dir.join("portfolio.db");
    wipe_local_data_for_path(db_path.as_path(), &state).await
}

