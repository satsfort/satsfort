use serde_json::Value as JsonValue;
use tauri::State;

use crate::app_state::AppState;
use crate::db_query::bind_json_values;

#[tauri::command]
pub async fn db_execute(query: String, values: Vec<JsonValue>, state: State<'_, AppState>) -> Result<u64, String> {
    let pool = {
        let lock = state.pool.read().await;
        lock.clone().ok_or_else(|| "Database is locked".to_string())?
    };

    let query_builder = bind_json_values(sqlx::query(&query), values.as_slice())?;
    let result = query_builder
        .execute(&pool)
        .await
        .map_err(|error| format!("Database execute failed: {error}"))?;

    Ok(result.rows_affected())
}

