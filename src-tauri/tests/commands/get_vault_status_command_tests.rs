mod common;

use common::{cleanup_state_and_files, new_test_app_state, unique_test_db_path};
use sats_fort_app_lib::commands::get_vault_status_command::get_vault_status_from_db_path;

#[test]
fn get_vault_status_reports_false_when_tests_db_is_missing() {
    let db_path = unique_test_db_path("vault-status-missing");
    let state = new_test_app_state();

    let status = get_vault_status_from_db_path(db_path.as_path());
    assert!(!status.database_exists, "database should not exist yet");

    let runtime = tokio::runtime::Runtime::new().expect("failed to create runtime");
    runtime.block_on(async { cleanup_state_and_files(&state, db_path.as_path()).await });
}

#[test]
fn get_vault_status_reports_true_when_tests_db_exists() {
    let db_path = unique_test_db_path("vault-status-exists");
    let state = new_test_app_state();

    std::fs::write(db_path.as_path(), "test-db-file").expect("failed to create tests.db file");

    let status = get_vault_status_from_db_path(db_path.as_path());
    assert!(status.database_exists, "database should exist");

    let runtime = tokio::runtime::Runtime::new().expect("failed to create runtime");
    runtime.block_on(async { cleanup_state_and_files(&state, db_path.as_path()).await });
}

