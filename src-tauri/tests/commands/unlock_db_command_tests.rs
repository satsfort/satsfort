mod common;

use common::{cleanup_state_and_files, close_state_only, new_test_app_state, unique_test_db_path};
use sats_fort_app_lib::commands::unlock_db_command::unlock_db_with_path;

#[tokio::test]
async fn unlock_db_creates_and_unlocks_isolated_tests_db() {
    let db_path = unique_test_db_path("unlock-db");
    let state = new_test_app_state();

    unlock_db_with_path("alice:secret".to_string(), db_path.as_path(), &state)
        .await
        .expect("unlock should succeed for fresh test database");

    let pool_is_set = state.pool.read().await.is_some();
    let password_is_set = state.master_password.read().await.is_some();
    assert!(pool_is_set, "pool should be set after unlock");
    assert!(password_is_set, "master password should be set after unlock");

    cleanup_state_and_files(&state, db_path.as_path()).await;
}

#[tokio::test]
async fn unlock_db_fails_with_wrong_password_for_existing_tests_db() {
    let db_path = unique_test_db_path("unlock-db-wrong-password");
    let state = new_test_app_state();

    unlock_db_with_path("alice:secret".to_string(), db_path.as_path(), &state)
        .await
        .expect("initial unlock should succeed");
    close_state_only(&state).await;

    let second_state = new_test_app_state();
    let err = unlock_db_with_path("alice:wrong".to_string(), db_path.as_path(), &second_state)
        .await
        .expect_err("unlock should fail with wrong password");
    assert!(
        err.contains("Wrong password") || err.contains("database error"),
        "unexpected error message: {err}"
    );

    cleanup_state_and_files(&second_state, db_path.as_path()).await;
}


