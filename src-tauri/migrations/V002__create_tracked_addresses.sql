CREATE TABLE IF NOT EXISTS tracked_addresses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    uuid TEXT NOT NULL UNIQUE,
    label TEXT NOT NULL,
    address TEXT NOT NULL UNIQUE,
    address_type TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

