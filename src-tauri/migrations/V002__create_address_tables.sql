CREATE TABLE addresses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    uuid TEXT NOT NULL UNIQUE,
    label TEXT NOT NULL,
    address TEXT NOT NULL UNIQUE,
    address_type TEXT NOT NULL,
    latest_balance_btc REAL,
    latest_tx_count INTEGER,
    latest_balance_fetched_at TEXT,
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
    latest_balance_btc REAL,
    latest_tx_count INTEGER,
    latest_balance_fetched_at TEXT,
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
    latest_balance_btc REAL,
    latest_tx_count INTEGER,
    latest_balance_fetched_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE address_balances (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    uuid TEXT NOT NULL UNIQUE,
    address_id INTEGER NOT NULL REFERENCES addresses(id) ON DELETE CASCADE,
    balance_btc REAL NOT NULL,
    tx_count INTEGER NOT NULL,
    fetched_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE xpub_balances (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    uuid TEXT NOT NULL UNIQUE,
    xpub_id INTEGER NOT NULL REFERENCES xpubs(id) ON DELETE CASCADE,
    balance_btc REAL NOT NULL,
    tx_count INTEGER NOT NULL,
    fetched_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE xpub_address_balances (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    uuid TEXT NOT NULL UNIQUE,
    xpub_address_id INTEGER NOT NULL REFERENCES xpub_addresses(id) ON DELETE CASCADE,
    balance_btc REAL NOT NULL,
    tx_count INTEGER NOT NULL,
    fetched_at TEXT NOT NULL DEFAULT (datetime('now'))
);
