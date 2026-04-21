use tauri::State;

use crate::structs::AppState;

pub async fn lock_db_state(state: &AppState) -> Result<(), String> {
    let mut lock = state.pool.write().await;
    *lock = None;
    drop(lock);

    let mut password_lock = state.master_password.write().await;
    *password_lock = None;
    Ok(())
}

#[tauri::command]
pub async fn lock_db(state: State<'_, AppState>) -> Result<(), String> {
    lock_db_state(&state).await
}

