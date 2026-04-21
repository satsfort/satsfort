pub fn log_unlock_failure(stage: &str, db_path: Option<&std::path::Path>, error: &str) {
    let db_path_display = db_path
        .map(|path| path.display().to_string())
        .unwrap_or_else(|| "<unresolved>".to_string());
    eprintln!("[unlock_db] stage={stage} db_path={db_path_display} error={error}");
}

pub fn sqlcipher_pragma_key(password: &str) -> String {
    // SQLCipher PRAGMA key expects a SQL string literal.
    let escaped = password.replace('\'', "''");
    format!("'{escaped}'")
}


