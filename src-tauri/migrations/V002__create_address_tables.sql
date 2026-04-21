CREATE TABLE addresses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    uuid TEXT NOT NULL UNIQUE,
    label TEXT NOT NULL,
    address TEXT NOT NULL UNIQUE,
    address_type TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE xpubs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    uuid TEXT NOT NULL UNIQUE,
    label TEXT NOT NULL,
    xpub TEXT NOT NULL UNIQUE,
    derivation_type TEXT NOT NULL,
    address_count INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE xpub_addresses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    uuid TEXT NOT NULL UNIQUE,
    xpub_id INTEGER NOT NULL REFERENCES xpubs(id) ON DELETE CASCADE,
    address TEXT NOT NULL,
    derivation_path TEXT NOT NULL,
    address_index INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
