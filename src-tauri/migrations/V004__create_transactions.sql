CREATE TABLE transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    uuid TEXT NOT NULL UNIQUE,
    txid TEXT NOT NULL,
    address_id INTEGER REFERENCES addresses(id) ON DELETE CASCADE,
    xpub_address_id INTEGER REFERENCES xpub_addresses(id) ON DELETE CASCADE,
    amount_sat INTEGER NOT NULL,
    block_time INTEGER,
    confirmed INTEGER NOT NULL DEFAULT 0,
    fetched_at TEXT NOT NULL DEFAULT (datetime('now')),
    CHECK (
        (address_id IS NOT NULL AND xpub_address_id IS NULL) OR
        (address_id IS NULL AND xpub_address_id IS NOT NULL)
    )
);

CREATE UNIQUE INDEX transactions_address_txid_idx
    ON transactions(txid, address_id)
    WHERE address_id IS NOT NULL;

CREATE UNIQUE INDEX transactions_xpub_address_txid_idx
    ON transactions(txid, xpub_address_id)
    WHERE xpub_address_id IS NOT NULL;

CREATE INDEX transactions_address_id_idx ON transactions(address_id);
CREATE INDEX transactions_xpub_address_id_idx ON transactions(xpub_address_id);
CREATE INDEX transactions_block_time_idx ON transactions(block_time DESC);
