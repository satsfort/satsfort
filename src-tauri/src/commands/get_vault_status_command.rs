use tauri::{AppHandle, Manager};

use crate::structs::VaultStatus;

#[tauri::command]
pub fn get_vault_status(app: AppHandle) -> Result<VaultStatus, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("Unable to resolve app data directory: {error}"))?;
    let db_path = app_data_dir.join("portfolio.db");
    Ok(VaultStatus {
        database_exists: db_path.exists(),
    })
}

