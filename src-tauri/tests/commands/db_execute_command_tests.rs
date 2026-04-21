mod common;

use common::{cleanup_state_and_files, new_test_app_state, unique_test_db_path};
use sats_fort_app_lib::commands::db_execute_command::db_execute_with_state;
use sats_fort_app_lib::commands::unlock_db_command::unlock_db_with_path;

#[tokio::test]
async fn db_execute_inserts_rows_when_unlocked() {
    let db_path = unique_test_db_path("db-execute");
    let state = new_test_app_state();

    unlock_db_with_path("alice:secret".to_string(), db_path.as_path(), &state)
        .await
        .expect("unlock should succeed");

    let rows_affected = db_execute_with_state(
        "INSERT INTO holdings (uuid, amount_btc, purchase_price, purchase_date, notes) VALUES ($1, $2, $3, $4, $5)".to_string(),
        vec![
            serde_json::json!("test-uuid"),
            serde_json::json!(0.25),
            serde_json::json!(60000),
            serde_json::json!("2026-01-01"),
            serde_json::json!("integration test"),
        ],
        &state,
    )
    .await
    .expect("db execute insert should succeed");

    assert_eq!(rows_affected, 1, "expected one inserted row");

    cleanup_state_and_files(&state, db_path.as_path()).await;
}

#[tokio::test]
async fn db_execute_fails_when_locked() {
    let db_path = unique_test_db_path("db-execute-locked");
    let state = new_test_app_state();

    let err = db_execute_with_state("DELETE FROM holdings".to_string(), vec![], &state)
        .await
        .expect_err("db execute should fail while locked");
    assert!(err.contains("Database is locked"), "unexpected error message: {err}");

    cleanup_state_and_files(&state, db_path.as_path()).await;
}

