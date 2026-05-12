use std::path::PathBuf;

const DEFAULT_PORT: u16 = 8080;
const DEFAULT_DATA_DIR: &str = "/data";
const DEFAULT_STATIC_DIR: &str = "/app/dist";
const DEFAULT_DB_FILE: &str = "portfolio.db";

#[derive(Clone, Debug)]
pub struct ServerConfig {
    pub port: u16,
    pub data_dir: PathBuf,
    pub static_dir: PathBuf,
}

impl ServerConfig {
    pub fn from_env() -> Self {
        let port = std::env::var("SATSFORT_PORT")
            .ok()
            .and_then(|raw| raw.parse::<u16>().ok())
            .unwrap_or(DEFAULT_PORT);

        let data_dir = std::env::var("SATSFORT_DATA_DIR")
            .map(PathBuf::from)
            .unwrap_or_else(|_| PathBuf::from(DEFAULT_DATA_DIR));

        let static_dir = std::env::var("SATSFORT_STATIC_DIR")
            .map(PathBuf::from)
            .unwrap_or_else(|_| PathBuf::from(DEFAULT_STATIC_DIR));

        Self {
            port,
            data_dir,
            static_dir,
        }
    }

    pub fn db_path(&self) -> PathBuf {
        self.data_dir.join(DEFAULT_DB_FILE)
    }
}
