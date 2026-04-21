pub mod commands;
pub mod structs;
pub mod utils;

use std::sync::Arc;
use tokio::sync::RwLock;

use structs::AppState;
use commands::{
    change_vault_password, db_execute, db_select, get_vault_status, lock_db, unlock_db,
    wipe_local_data,
};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(AppState {
            pool: Arc::new(RwLock::new(None)),
            master_password: Arc::new(RwLock::new(None)),
        })
        .invoke_handler(tauri::generate_handler![
            unlock_db,
            lock_db,
            change_vault_password,
            wipe_local_data,
            get_vault_status,
            db_execute,
            db_select
        ])
        .run(tauri::generate_context!())
        .expect("error while running Tauri application");
}