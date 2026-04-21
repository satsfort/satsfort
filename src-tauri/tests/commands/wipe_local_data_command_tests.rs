mod common;

use common::{cleanup_state_and_files, new_test_app_state, unique_test_db_path};
use sats_fort_app_lib::commands::unlock_db_command::unlock_db_with_path;
use sats_fort_app_lib::commands::wipe_local_data_command::wipe_local_data_for_path;

#[tokio::test]
async fn wipe_local_data_removes_tests_db_and_clears_state() {
    let db_path = unique_test_db_path("wipe-local-data");
    let state = new_test_app_state();

    unlock_db_with_path("alice:secret".to_string(), db_path.as_path(), &state)
        .await
        .expect("unlock should create tests.db");

    assert!(db_path.exists(), "tests.db should exist before wipe");

    wipe_local_data_for_path(db_path.as_path(), &state)
        .await
        .expect("wipe local data should succeed");

    assert!(!db_path.exists(), "tests.db should be removed after wipe");
    assert!(state.pool.read().await.is_none(), "pool should be cleared after wipe");
    assert!(
        state.master_password.read().await.is_none(),
        "master password should be cleared after wipe"
    );

    cleanup_state_and_files(&state, db_path.as_path()).await;
}

