mod common;

use common::{cleanup_state_and_files, new_test_app_state, unique_test_db_path};
use sats_fort_app_lib::commands::change_vault_password_command::change_vault_password_for_state;
use sats_fort_app_lib::commands::unlock_db_command::unlock_db_with_path;

#[tokio::test]
async fn change_password_rekeys_and_requires_new_password_afterwards() {
    let db_path = unique_test_db_path("change-password");
    let state = new_test_app_state();

    unlock_db_with_path("alice:old-secret".to_string(), db_path.as_path(), &state)
        .await
        .expect("initial unlock should succeed");

    change_vault_password_for_state(
        "alice:old-secret".to_string(),
        "alice:new-secret".to_string(),
        &state,
    )
    .await
    .expect("password change should succeed");

    let new_state = new_test_app_state();
    unlock_db_with_path("alice:new-secret".to_string(), db_path.as_path(), &new_state)
        .await
        .expect("unlock with new password should succeed");

    let old_state = new_test_app_state();
    let old_password_error = unlock_db_with_path("alice:old-secret".to_string(), db_path.as_path(), &old_state)
        .await
        .expect_err("unlock with old password should fail");
    assert!(
        old_password_error.contains("Wrong password") || old_password_error.contains("database error"),
        "unexpected old-password failure message: {old_password_error}"
    );

    cleanup_state_and_files(&new_state, db_path.as_path()).await;
    cleanup_state_and_files(&old_state, db_path.as_path()).await;
}

#[tokio::test]
async fn change_password_fails_with_wrong_current_password() {
    let db_path = unique_test_db_path("change-password-wrong-current");
    let state = new_test_app_state();

    unlock_db_with_path("alice:old-secret".to_string(), db_path.as_path(), &state)
        .await
        .expect("initial unlock should succeed");

    let err = change_vault_password_for_state(
        "alice:not-current".to_string(),
        "alice:new-secret".to_string(),
        &state,
    )
    .await
    .expect_err("changing password with wrong current password should fail");
    assert!(
        err.contains("Current password is incorrect"),
        "unexpected error message: {err}"
    );

    cleanup_state_and_files(&state, db_path.as_path()).await;
}

