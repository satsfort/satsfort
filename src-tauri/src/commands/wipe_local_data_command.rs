use tauri::{AppHandle, Manager, State};

use crate::app_state::AppState;

#[tauri::command]
pub async fn wipe_local_data(app: AppHandle, state: State<'_, AppState>) -> Result<(), String> {
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

    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("Unable to resolve app data directory: {error}"))?;

    let db_files = [
        app_data_dir.join("portfolio.db"),
        app_data_dir.join("portfolio.db-wal"),
        app_data_dir.join("portfolio.db-shm"),
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

