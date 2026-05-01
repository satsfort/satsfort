CREATE TABLE addresses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    uuid TEXT NOT NULL UNIQUE,
    label TEXT NOT NULL,
    address TEXT NOT NULL UNIQUE,
    address_type TEXT NOT NULL,
    latest_balance_btc REAL,
    latest_balance_usd REAL,
    latest_tx_count INTEGER,
    latest_balance_fetched_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX addresses_address_idx ON addresses(address);

CREATE TABLE xpubs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    uuid TEXT NOT NULL UNIQUE,
    label TEXT NOT NULL,
    xpub TEXT NOT NULL UNIQUE,
    derivation_type TEXT NOT NULL,
    address_count INTEGER NOT NULL,
    latest_balance_btc REAL,
    latest_balance_usd REAL,
    latest_tx_count INTEGER,
    latest_balance_fetched_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX xpubs_xpub_idx ON xpubs(xpub);

CREATE TABLE xpub_addresses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    uuid TEXT NOT NULL UNIQUE,
    xpub_id INTEGER NOT NULL REFERENCES xpubs(id) ON DELETE CASCADE,
    address TEXT NOT NULL,
    derivation_path TEXT NOT NULL,
    address_index INTEGER NOT NULL,
    latest_balance_btc REAL,
    latest_balance_usd REAL,
    latest_tx_count INTEGER,
    latest_balance_fetched_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX xpub_addresses_address_idx ON xpub_addresses(address);
CREATE INDEX xpub_addresses_xpub_id_idx ON xpub_addresses(xpub_id);

CREATE TABLE address_balances (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    uuid TEXT NOT NULL UNIQUE,
    address_id INTEGER NOT NULL REFERENCES addresses(id) ON DELETE CASCADE,
    balance_btc REAL NOT NULL,
    balance_usd REAL NOT NULL,
    tx_count INTEGER NOT NULL,
    fetched_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX address_balances_address_id_idx ON address_balances(address_id);

CREATE TABLE xpub_balances (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    uuid TEXT NOT NULL UNIQUE,
    xpub_id INTEGER NOT NULL REFERENCES xpubs(id) ON DELETE CASCADE,
    balance_btc REAL NOT NULL,
    balance_usd REAL NOT NULL,
    tx_count INTEGER NOT NULL,
    fetched_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX xpub_balances_xpub_id_idx ON xpub_balances(xpub_id);

CREATE TABLE xpub_address_balances (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    uuid TEXT NOT NULL UNIQUE,
    xpub_address_id INTEGER NOT NULL REFERENCES xpub_addresses(id) ON DELETE CASCADE,
    balance_btc REAL NOT NULL,
    balance_usd REAL NOT NULL,
    tx_count INTEGER NOT NULL,
    fetched_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX xpub_address_balances_xpub_address_id_idx ON xpub_address_balances(xpub_address_id);

CREATE TABLE portfolio_value (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    uuid TEXT NOT NULL UNIQUE,
    balance_btc REAL NOT NULL,
    balance_usd REAL NOT NULL,
    fetched_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX portfolio_value_fetched_at_idx ON portfolio_value(fetched_at);
