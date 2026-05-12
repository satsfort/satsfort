use axum::{
    extract::State,
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};
use serde::Deserialize;
use serde_json::{Map as JsonMap, Value as JsonValue};

use crate::commands::change_vault_password_command::change_vault_password_for_state;
use crate::commands::db_execute_command::db_execute_with_state;
use crate::commands::db_select_command::db_select_with_state;
use crate::commands::get_vault_status_command::get_vault_status_from_db_path;
use crate::commands::lock_db_command::lock_db_state;
use crate::commands::unlock_db_command::unlock_db_with_path;
use crate::commands::wipe_local_data_command::wipe_local_data_for_path;
use crate::structs::{AppState, VaultStatus};

use super::config::ServerConfig;

#[derive(Clone)]
pub struct ServerState {
    pub app_state: AppState,
    pub config: ServerConfig,
}

pub struct CommandError(String);

impl IntoResponse for CommandError {
    fn into_response(self) -> Response {
        (StatusCode::BAD_REQUEST, self.0).into_response()
    }
}

impl From<String> for CommandError {
    fn from(value: String) -> Self {
        CommandError(value)
    }
}

#[derive(Deserialize)]
pub struct UnlockDbBody {
    pub password: String,
}

pub async fn unlock_db(
    State(state): State<ServerState>,
    Json(body): Json<UnlockDbBody>,
) -> Result<StatusCode, CommandError> {
    unlock_db_with_path(body.password, &state.config.db_path(), &state.app_state).await?;
    Ok(StatusCode::NO_CONTENT)
}

pub async fn lock_db(State(state): State<ServerState>) -> Result<StatusCode, CommandError> {
    lock_db_state(&state.app_state).await?;
    Ok(StatusCode::NO_CONTENT)
}

pub async fn vault_status(State(state): State<ServerState>) -> Json<VaultStatus> {
    Json(get_vault_status_from_db_path(&state.config.db_path()))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChangeVaultPasswordBody {
    pub current_password: String,
    pub new_password: String,
}

pub async fn change_vault_password(
    State(state): State<ServerState>,
    Json(body): Json<ChangeVaultPasswordBody>,
) -> Result<StatusCode, CommandError> {
    change_vault_password_for_state(body.current_password, body.new_password, &state.app_state).await?;
    Ok(StatusCode::NO_CONTENT)
}

pub async fn wipe_local_data(State(state): State<ServerState>) -> Result<StatusCode, CommandError> {
    wipe_local_data_for_path(&state.config.db_path(), &state.app_state).await?;
    Ok(StatusCode::NO_CONTENT)
}

#[derive(Deserialize)]
pub struct DbExecuteBody {
    pub query: String,
    pub values: Vec<JsonValue>,
}

pub async fn db_execute(
    State(state): State<ServerState>,
    Json(body): Json<DbExecuteBody>,
) -> Result<Json<u64>, CommandError> {
    let rows_affected = db_execute_with_state(body.query, body.values, &state.app_state).await?;
    Ok(Json(rows_affected))
}

#[derive(Deserialize)]
pub struct DbSelectBody {
    pub query: String,
    pub values: Vec<JsonValue>,
}

pub async fn db_select(
    State(state): State<ServerState>,
    Json(body): Json<DbSelectBody>,
) -> Result<Json<Vec<JsonMap<String, JsonValue>>>, CommandError> {
    let rows = db_select_with_state(body.query, body.values, &state.app_state).await?;
    Ok(Json(rows))
}
