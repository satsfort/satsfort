mod common;

use common::{cleanup_state_and_files, new_test_app_state, unique_test_db_path};
use sats_fort_app_lib::commands::lock_db_command::lock_db_state;
use sats_fort_app_lib::commands::unlock_db_command::unlock_db_with_path;

#[tokio::test]
async fn lock_db_clears_pool_and_password_from_state() {
    let db_path = unique_test_db_path("lock-db");
    let state = new_test_app_state();

    unlock_db_with_path("alice:secret".to_string(), db_path.as_path(), &state)
        .await
        .expect("unlock should succeed before lock");

    lock_db_state(&state)
        .await
        .expect("lock should succeed for unlocked state");

    assert!(state.pool.read().await.is_none(), "pool should be cleared by lock");
    assert!(
        state.master_password.read().await.is_none(),
        "master password should be cleared by lock"
    );

    cleanup_state_and_files(&state, db_path.as_path()).await;
}

