use serde_json::{Map as JsonMap, Value as JsonValue};
use serde::Serialize;
use sqlx::sqlite::{SqliteConnectOptions, SqlitePool};
use sqlx::{Column, Row, TypeInfo};
use std::collections::HashSet;
use std::sync::Arc;
use tauri::{AppHandle, Manager, State};
use tokio::sync::RwLock;

fn log_unlock_failure(stage: &str, db_path: Option<&std::path::Path>, error: &str) {
    let db_path_display = db_path
        .map(|path| path.display().to_string())
        .unwrap_or_else(|| "<unresolved>".to_string());
    eprintln!(
        "[unlock_db] stage={stage} db_path={db_path_display} error={error}"
    );
}

fn sqlcipher_pragma_key(password: &str) -> String {
    // SQLCipher PRAGMA key expects a SQL string literal.
    let escaped = password.replace('\'', "''");
    format!("'{escaped}'")
}

pub struct AppState {
    pub pool: Arc<RwLock<Option<SqlitePool>>>,
    pub master_password: Arc<RwLock<Option<String>>>,
}

#[derive(Serialize)]
struct VaultStatus {
    database_exists: bool,
}

const MIGRATIONS: [DbMigration; 3] = [
    DbMigration {
        version: 1,
        script_name: "V001__create_holdings.sql",
        sql: include_str!("../migrations/V001__create_holdings.sql"),
    },
    DbMigration {
        version: 2,
        script_name: "V002__create_tracked_addresses.sql",
        sql: include_str!("../migrations/V002__create_tracked_addresses.sql"),
    },
    DbMigration {
        version: 3,
        script_name: "V003__create_tracked_xpubs.sql",
        sql: include_str!("../migrations/V003__create_tracked_xpubs.sql"),
    },
];

const MIGRATION_HISTORY_TABLE_SQL: &str = "CREATE TABLE IF NOT EXISTS schema_migration_history (
    version INTEGER PRIMARY KEY,
    script_name TEXT NOT NULL,
    executed_at TEXT NOT NULL DEFAULT (datetime('now'))
)";

struct DbMigration {
    version: i64,
    script_name: &'static str,
    sql: &'static str,
}

async fn run_pending_migrations(pool: &SqlitePool, db_path: &std::path::Path) -> Result<(), String> {
    sqlx::query(MIGRATION_HISTORY_TABLE_SQL)
        .execute(pool)
        .await
        .map_err(|error| {
            log_unlock_failure(
                "ensure_migration_history",
                Some(db_path),
                &error.to_string(),
            );
            format!("Failed preparing migration history: {error}")
        })?;

    let version_rows = sqlx::query("SELECT version FROM schema_migration_history")
        .fetch_all(pool)
        .await
        .map_err(|error| {
            log_unlock_failure("read_migration_history", Some(db_path), &error.to_string());
            format!("Failed reading migration history: {error}")
        })?;

    let mut applied_versions = HashSet::new();
    for row in version_rows {
        let version = row.try_get::<i64, _>("version").map_err(|error| {
            log_unlock_failure(
                "parse_migration_history",
                Some(db_path),
                &error.to_string(),
            );
            format!("Failed parsing migration history row: {error}")
        })?;
        applied_versions.insert(version);
    }

    for migration in MIGRATIONS {
        if applied_versions.contains(&migration.version) {
            continue;
        }

        let mut tx = pool.begin().await.map_err(|error| {
            log_unlock_failure("begin_migration_transaction", Some(db_path), &error.to_string());
            format!("Failed starting migration transaction: {error}")
        })?;

        sqlx::query(migration.sql)
            .execute(&mut *tx)
            .await
            .map_err(|error| {
                log_unlock_failure(
                    "run_migration_sql",
                    Some(db_path),
                    &format!(
                        "version={} script_name={} error={error}",
                        migration.version, migration.script_name
                    ),
                );
                format!(
                    "Failed running migration {} ({}): {error}",
                    migration.version, migration.script_name
                )
            })?;

        sqlx::query(
            "INSERT INTO schema_migration_history (version, script_name) VALUES ($1, $2)",
        )
        .bind(migration.version)
        .bind(migration.script_name)
        .execute(&mut *tx)
        .await
        .map_err(|error| {
            log_unlock_failure(
                "record_migration_history",
                Some(db_path),
                &format!(
                    "version={} script_name={} error={error}",
                    migration.version, migration.script_name
                ),
            );
            format!(
                "Failed recording migration {} ({}): {error}",
                migration.version, migration.script_name
            )
        })?;

        tx.commit().await.map_err(|error| {
            log_unlock_failure(
                "commit_migration_transaction",
                Some(db_path),
                &format!(
                    "version={} script_name={} error={error}",
                    migration.version, migration.script_name
                ),
            );
            format!(
                "Failed committing migration {} ({}): {error}",
                migration.version, migration.script_name
            )
        })?;
    }

    Ok(())
}

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
        .map_err(|error| {
            log_unlock_failure(
                "resolve_app_data_dir",
                None,
                &format!("Unable to resolve app data directory: {error}"),
            );
            format!("Unable to resolve app data directory: {error}")
        })?;

    std::fs::create_dir_all(&app_data_dir)
        .map_err(|error| {
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

    let pool = SqlitePool::connect_with(options)
        .await
        .map_err(|error| {
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

#[tauri::command]
async fn lock_db(state: State<'_, AppState>) -> Result<(), String> {
    let mut lock = state.pool.write().await;
    *lock = None;
    drop(lock);

    let mut password_lock = state.master_password.write().await;
    *password_lock = None;
    Ok(())
}

#[tauri::command]
async fn change_vault_password(current_password: String, new_password: String, state: State<'_, AppState>) -> Result<(), String> {
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

#[tauri::command]
async fn wipe_local_data(app: AppHandle, state: State<'_, AppState>) -> Result<(), String> {
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

#[tauri::command]
fn get_vault_status(app: AppHandle) -> Result<VaultStatus, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("Unable to resolve app data directory: {error}"))?;
    let db_path = app_data_dir.join("portfolio.db");
    Ok(VaultStatus {
        database_exists: db_path.exists(),
    })
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