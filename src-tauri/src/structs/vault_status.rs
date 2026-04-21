use serde::Serialize;

#[derive(Serialize)]
pub struct VaultStatus {
    pub database_exists: bool,
}


