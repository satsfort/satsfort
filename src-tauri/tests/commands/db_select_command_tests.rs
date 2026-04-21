mod common;

use common::{cleanup_state_and_files, new_test_app_state, unique_test_db_path};
use sats_fort_app_lib::commands::db_execute_command::db_execute_with_state;
use sats_fort_app_lib::commands::db_select_command::db_select_with_state;
use sats_fort_app_lib::commands::unlock_db_command::unlock_db_with_path;

#[tokio::test]
async fn db_select_reads_rows_when_unlocked() {
    let db_path = unique_test_db_path("db-select");
    let state = new_test_app_state();

    unlock_db_with_path("alice:secret".to_string(), db_path.as_path(), &state)
        .await
        .expect("unlock should succeed");

    db_execute_with_state(
        "INSERT INTO holdings (uuid, amount_btc, purchase_price, purchase_date, notes) VALUES ($1, $2, $3, $4, $5)".to_string(),
        vec![
            serde_json::json!("select-uuid"),
            serde_json::json!(0.5),
            serde_json::json!(65000),
            serde_json::json!("2026-02-01"),
            serde_json::json!("select test"),
        ],
        &state,
    )
    .await
    .expect("insert for select test should succeed");

    let rows = db_select_with_state(
        "SELECT uuid, amount_btc FROM holdings WHERE uuid = $1".to_string(),
        vec![serde_json::json!("select-uuid")],
        &state,
    )
    .await
    .expect("select should succeed");

    assert_eq!(rows.len(), 1, "expected one selected row");
    assert_eq!(rows[0].get("uuid"), Some(&serde_json::json!("select-uuid")));

    cleanup_state_and_files(&state, db_path.as_path()).await;
}

#[tokio::test]
async fn db_select_fails_when_locked() {
    let db_path = unique_test_db_path("db-select-locked");
    let state = new_test_app_state();

    let err = db_select_with_state("SELECT 1".to_string(), vec![], &state)
        .await
        .expect_err("select should fail while locked");
    assert!(err.contains("Database is locked"), "unexpected error message: {err}");

    cleanup_state_and_files(&state, db_path.as_path()).await;
}

