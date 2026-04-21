mod common;

use common::{cleanup_test_db, new_test_pool, unique_test_db_path};
use sats_fort_app_lib::utils::migrations::run_pending_migrations;

#[tokio::test]
async fn migrations_are_idempotent_for_isolated_tests_db() {
    let db_path = unique_test_db_path("migrations-idempotent");
    assert_eq!(
        db_path.file_name().and_then(|name| name.to_str()),
        Some("tests.db"),
        "test database file must be named tests.db"
    );

    let pool = new_test_pool(&db_path).await;

    run_pending_migrations(&pool, &db_path)
        .await
        .expect("first migration run should succeed");
    run_pending_migrations(&pool, &db_path)
        .await
        .expect("second migration run should also succeed");

    let migration_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM schema_migration_history")
        .fetch_one(&pool)
        .await
        .expect("failed to read migration history count");
    assert_eq!(migration_count, 3, "expected exactly three migration entries");

    let holdings_count: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='holdings'",
    )
    .fetch_one(&pool)
    .await
    .expect("failed to verify holdings table existence");
    assert_eq!(holdings_count, 1, "expected holdings table to exist");

    cleanup_test_db(pool, &db_path).await;
}

#[tokio::test]
async fn migrations_fail_when_checksum_history_is_tampered() {
    let db_path = unique_test_db_path("migrations-checksum");
    let pool = new_test_pool(&db_path).await;

    run_pending_migrations(&pool, &db_path)
        .await
        .expect("initial migration run should succeed");

    sqlx::query("UPDATE schema_migration_history SET checksum = $1 WHERE version = $2")
        .bind("tampered-checksum")
        .bind(1_i64)
        .execute(&pool)
        .await
        .expect("failed to tamper migration checksum");

    let err = run_pending_migrations(&pool, &db_path)
        .await
        .expect_err("checksum mismatch should fail validation");
    assert!(
        err.to_ascii_lowercase().contains("checksum mismatch"),
        "expected checksum mismatch error, got: {err}"
    );

    cleanup_test_db(pool, &db_path).await;
}

