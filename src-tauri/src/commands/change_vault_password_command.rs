use tauri::State;

use crate::structs::AppState;
use crate::utils::sqlcipher::sqlcipher_pragma_key;

#[tauri::command]
pub async fn change_vault_password(
    current_password: String,
    new_password: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    if current_password.trim().is_empty() {
        return Err("Current password is required".to_string());
    }

    if new_password.trim().is_empty() {
        return Err("New password is required".to_string());
    }

    let active_password = {
        let password_lock = state.master_password.read().await;
        password_lock
            .clone()
            .ok_or_else(|| "Database is locked. Unlock before changing password.".to_string())?
    };

    if active_password != current_password {
        return Err("Current password is incorrect".to_string());
    }

    let pool = {
        let lock = state.pool.read().await;
        lock.clone()
            .ok_or_else(|| "Database is locked. Unlock before changing password.".to_string())?
    };

    let rekey_sql = format!("PRAGMA rekey = {}", sqlcipher_pragma_key(&new_password));
    sqlx::query(&rekey_sql).execute(&pool).await.map_err(|error| {
        eprintln!("[change_vault_password] stage=rekey error={error}");
        "Failed to update database password".to_string()
    })?;

    let mut lock = state.pool.write().await;
    *lock = None;
    drop(lock);

    let mut password_lock = state.master_password.write().await;
    *password_lock = None;

    Ok(())
}

