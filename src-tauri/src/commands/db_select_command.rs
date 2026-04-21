use serde_json::{Map as JsonMap, Value as JsonValue};
use sqlx::{Column, Row, TypeInfo};
use tauri::State;

use crate::structs::AppState;
use crate::utils::db_query::{bind_json_values, decode_row_value};

pub async fn db_select_with_state(
    query: String,
    values: Vec<JsonValue>,
    state: &AppState,
) -> Result<Vec<JsonMap<String, JsonValue>>, String> {
    let pool = {
        let lock = state.pool.read().await;
        lock.clone().ok_or_else(|| "Database is locked".to_string())?
    };

    let query_builder = bind_json_values(sqlx::query(&query), values.as_slice())?;
    let rows = query_builder
        .fetch_all(&pool)
        .await
        .map_err(|error| format!("Database select failed: {error}"))?;

    let mut result_rows = Vec::with_capacity(rows.len());
    for row in rows {
        let mut result_row = JsonMap::new();
        for column in row.columns() {
            let column_name = column.name();
            let db_type = column.type_info().name().to_ascii_uppercase();
            let value = decode_row_value(&row, column_name, &db_type);
            result_row.insert(column_name.to_string(), value);
        }
        result_rows.push(result_row);
    }

    Ok(result_rows)
}

#[tauri::command]
pub async fn db_select(
    query: String,
    values: Vec<JsonValue>,
    state: State<'_, AppState>,
) -> Result<Vec<JsonMap<String, JsonValue>>, String> {
    db_select_with_state(query, values, &state).await
}

