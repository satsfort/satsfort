use include_dir::{include_dir, Dir};
use sha2::{Digest, Sha256};
use sqlx::sqlite::SqlitePool;
use sqlx::Row;
use std::collections::{HashMap, HashSet};

use crate::utils::sqlcipher::log_unlock_failure;

static MIGRATIONS_DIR: Dir<'_> = include_dir!("$CARGO_MANIFEST_DIR/migrations");

const MIGRATION_HISTORY_TABLE_SQL: &str = "CREATE TABLE IF NOT EXISTS schema_migration_history (
    version INTEGER PRIMARY KEY,
    script_name TEXT NOT NULL,
    checksum TEXT NOT NULL,
    executed_at TEXT NOT NULL DEFAULT (datetime('now'))
)";

struct DbMigration {
    version: i64,
    script_name: &'static str,
    sql: &'static str,
}

fn parse_migration_version(script_name: &str) -> i64 {
    fn invalid(script_name: &str) -> ! {
        panic!(
            "Invalid migration filename '{script_name}': expected format V<digits>__<name>.sql"
        );
    }

    let without_ext = script_name
        .strip_suffix(".sql")
        .unwrap_or_else(|| invalid(script_name));
    let rest = without_ext
        .strip_prefix('V')
        .unwrap_or_else(|| invalid(script_name));
    let (version_str, name) = rest
        .split_once("__")
        .unwrap_or_else(|| invalid(script_name));

    if version_str.is_empty() || !version_str.chars().all(|c| c.is_ascii_digit()) {
        invalid(script_name);
    }
    if name.is_empty() {
        invalid(script_name);
    }

    version_str
        .parse::<i64>()
        .unwrap_or_else(|_| invalid(script_name))
}

fn load_migrations() -> Vec<DbMigration> {
    let mut migrations: Vec<DbMigration> = MIGRATIONS_DIR
        .files()
        .map(|file| {
            let script_name = file
                .path()
                .file_name()
                .and_then(|name| name.to_str())
                .unwrap_or_else(|| {
                    panic!("Migration file has non-UTF-8 path: {:?}", file.path())
                });

            let version = parse_migration_version(script_name);
            let sql = file
                .contents_utf8()
                .unwrap_or_else(|| panic!("Migration file '{script_name}' is not valid UTF-8"));

            DbMigration {
                version,
                script_name,
                sql,
            }
        })
        .collect();

    migrations.sort_by_key(|m| m.version);

    for pair in migrations.windows(2) {
        if pair[0].version == pair[1].version {
            panic!(
                "Duplicate migration version {}: '{}' and '{}'",
                pair[0].version, pair[0].script_name, pair[1].script_name
            );
        }
    }

    migrations
}

fn migration_checksum(sql: &str) -> String {
    let digest = Sha256::digest(sql.as_bytes());
    digest.iter().map(|byte| format!("{byte:02x}")).collect()
}

pub async fn run_pending_migrations(pool: &SqlitePool, db_path: &std::path::Path) -> Result<(), String> {
    let migrations = load_migrations();

    sqlx::query(MIGRATION_HISTORY_TABLE_SQL)
        .execute(pool)
        .await
        .map_err(|error| {
            log_unlock_failure("ensure_migration_history", Some(db_path), &error.to_string());
            format!("Failed preparing migration history: {error}")
        })?;

    let migration_by_version: HashMap<i64, &DbMigration> = migrations
        .iter()
        .map(|migration| (migration.version, migration))
        .collect();

    let version_rows = sqlx::query("SELECT version, script_name, checksum FROM schema_migration_history")
        .fetch_all(pool)
        .await
        .map_err(|error| {
            log_unlock_failure("read_migration_history", Some(db_path), &error.to_string());
            format!("Failed reading migration history: {error}")
        })?;

    let mut applied_versions = HashSet::new();
    for row in version_rows {
        let version = row.try_get::<i64, _>("version").map_err(|error| {
            log_unlock_failure("parse_migration_history", Some(db_path), &error.to_string());
            format!("Failed parsing migration history row: {error}")
        })?;

        let script_name = row.try_get::<String, _>("script_name").map_err(|error| {
            log_unlock_failure("parse_migration_history", Some(db_path), &error.to_string());
            format!("Failed parsing migration history row: {error}")
        })?;

        let checksum = row.try_get::<String, _>("checksum").map_err(|error| {
            log_unlock_failure("parse_migration_history", Some(db_path), &error.to_string());
            format!("Failed parsing migration history row: {error}")
        })?;

        let expected_migration = migration_by_version.get(&version).ok_or_else(|| {
            log_unlock_failure(
                "validate_migration_history",
                Some(db_path),
                &format!("Unknown migration version in history: {version}"),
            );
            format!("Unknown migration version {version} found in migration history")
        })?;

        let expected_checksum = migration_checksum(expected_migration.sql);
        if checksum != expected_checksum {
            log_unlock_failure(
                "validate_migration_history",
                Some(db_path),
                &format!(
                    "Checksum mismatch for version={} script_name={} stored_checksum={} expected_checksum={}",
                    version, script_name, checksum, expected_checksum
                ),
            );
            return Err(format!(
                "Migration checksum mismatch for version {} ({}). Wipe local data or restore the original migration file.",
                version, script_name
            ));
        }

        applied_versions.insert(version);
    }

    for migration in &migrations {
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

        let checksum = migration_checksum(migration.sql);
        sqlx::query("INSERT INTO schema_migration_history (version, script_name, checksum) VALUES ($1, $2, $3)")
            .bind(migration.version)
            .bind(migration.script_name)
            .bind(checksum.as_str())
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
