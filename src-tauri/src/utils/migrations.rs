use sha2::{Digest, Sha256};
use sqlx::sqlite::SqlitePool;
use sqlx::Row;
use std::collections::{HashMap, HashSet};

use crate::utils::sqlcipher::log_unlock_failure;

const MIGRATIONS: [DbMigration; 3] = [
    DbMigration {
        version: 1,
        script_name: "V001__create_holdings.sql",
        sql: include_str!("../../migrations/V001__create_holdings.sql"),
    },
    DbMigration {
        version: 2,
        script_name: "V002__create_tracked_addresses.sql",
        sql: include_str!("../../migrations/V002__create_tracked_addresses.sql"),
    },
    DbMigration {
        version: 3,
        script_name: "V003__create_tracked_xpubs.sql",
        sql: include_str!("../../migrations/V003__create_tracked_xpubs.sql"),
    },
];

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

fn migration_checksum(sql: &str) -> String {
    let digest = Sha256::digest(sql.as_bytes());
    digest.iter().map(|byte| format!("{byte:02x}")).collect()
}

pub async fn run_pending_migrations(pool: &SqlitePool, db_path: &std::path::Path) -> Result<(), String> {
    sqlx::query(MIGRATION_HISTORY_TABLE_SQL)
        .execute(pool)
        .await
        .map_err(|error| {
            log_unlock_failure("ensure_migration_history", Some(db_path), &error.to_string());
            format!("Failed preparing migration history: {error}")
        })?;

    let migration_by_version: HashMap<i64, &DbMigration> = MIGRATIONS
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


