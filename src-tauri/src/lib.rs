use serde_json::{Map as JsonMap, Value as JsonValue};
use sqlx::sqlite::{SqliteConnectOptions, SqlitePool};
use sqlx::{Column, Row, TypeInfo};
use std::sync::Arc;
use tauri::{AppHandle, Manager, State};
use tokio::sync::RwLock;

pub struct AppState {
    pub pool: Arc<RwLock<Option<SqlitePool>>>,
}

const MIGRATIONS: [&str; 3] = [
    "CREATE TABLE IF NOT EXISTS holdings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        uuid TEXT NOT NULL UNIQUE,
        amount_btc REAL NOT NULL,
        purchase_price REAL,
        purchase_date TEXT,
        notes TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )",
    "CREATE TABLE IF NOT EXISTS tracked_addresses (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        uuid TEXT NOT NULL UNIQUE,
        label TEXT NOT NULL,
        address TEXT NOT NULL UNIQUE,
        address_type TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )",
    "CREATE TABLE IF NOT EXISTS tracked_xpubs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        uuid TEXT NOT NULL UNIQUE,
        label TEXT NOT NULL,
        xpub TEXT NOT NULL UNIQUE,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )",
];

fn bind_json_values<'q>(
    mut query: sqlx::query::Query<'q, sqlx::Sqlite, sqlx::sqlite::SqliteArguments<'q>>,
    values: &'q [JsonValue],
) -> Result<sqlx::query::Query<'q, sqlx::Sqlite, sqlx::sqlite::SqliteArguments<'q>>, String> {
    for value in values {
        query = match value {
            JsonValue::String(text) => query.bind(text),
            JsonValue::Number(number) => {
                if let Some(int_val) = number.as_i64() {
                    query.bind(int_val)
                } else if let Some(float_val) = number.as_f64() {
                    query.bind(float_val)
                } else {
                    return Err("Unsupported numeric value".to_string());
                }
            }
            JsonValue::Bool(flag) => query.bind(*flag),
            JsonValue::Null => query.bind(None::<String>),
            JsonValue::Array(_) | JsonValue::Object(_) => {
                return Err("Only primitive JSON values are supported".to_string());
            }
        };
    }

    Ok(query)
}

fn decode_row_value(row: &sqlx::sqlite::SqliteRow, column_name: &str, db_type: &str) -> JsonValue {
    if db_type == "INTEGER" || db_type == "BIGINT" {
        if let Ok(value) = row.try_get::<i64, _>(column_name) {
            return JsonValue::from(value);
        }
    }

    if db_type == "REAL" {
        if let Ok(value) = row.try_get::<f64, _>(column_name) {
            return JsonValue::from(value);
        }
    }

    if db_type == "TEXT" {
        if let Ok(value) = row.try_get::<String, _>(column_name) {
            return JsonValue::from(value);
        }
    }

    if let Ok(value) = row.try_get::<String, _>(column_name) {
        return JsonValue::from(value);
    }
    if let Ok(value) = row.try_get::<i64, _>(column_name) {
        return JsonValue::from(value);
    }
    if let Ok(value) = row.try_get::<f64, _>(column_name) {
        return JsonValue::from(value);
    }
    if let Ok(value) = row.try_get::<bool, _>(column_name) {
        return JsonValue::from(value);
    }

    JsonValue::Null
}

#[tauri::command]
async fn unlock_db(password: String, app: AppHandle, state: State<'_, AppState>) -> Result<(), String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("Unable to resolve app data directory: {error}"))?;

    std::fs::create_dir_all(&app_data_dir)
        .map_err(|error| format!("Unable to initialize app data directory: {error}"))?;

    let db_path = app_data_dir.join("portfolio.db");
    let options = SqliteConnectOptions::new()
        .filename(db_path)
        .pragma("key", password)
        .create_if_missing(true);

    let pool = SqlitePool::connect_with(options)
        .await
        .map_err(|_| "Wrong password or database error".to_string())?;

    sqlx::query("SELECT count(*) FROM sqlite_master")
        .execute(&pool)
        .await
        .map_err(|_| "Wrong password or database error".to_string())?;

    for migration in MIGRATIONS {
        sqlx::query(migration)
            .execute(&pool)
            .await
            .map_err(|error| format!("Failed running migrations: {error}"))?;
    }

    let mut lock = state.pool.write().await;
    *lock = Some(pool);

    Ok(())
}

#[tauri::command]
async fn lock_db(state: State<'_, AppState>) -> Result<(), String> {
    let mut lock = state.pool.write().await;
    *lock = None;
    Ok(())
}

#[tauri::command]
async fn db_execute(query: String, values: Vec<JsonValue>, state: State<'_, AppState>) -> Result<u64, String> {
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

#[tauri::command]
async fn db_select(
    query: String,
    values: Vec<JsonValue>,
    state: State<'_, AppState>,
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(AppState {
            pool: Arc::new(RwLock::new(None)),
        })
        .invoke_handler(tauri::generate_handler![unlock_db, lock_db, db_execute, db_select])
        .run(tauri::generate_context!())
        .expect("error while running Tauri application");
}