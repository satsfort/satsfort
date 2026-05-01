CREATE TABLE address_transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    uuid TEXT NOT NULL UNIQUE,
    txid TEXT NOT NULL,
    address_id INTEGER NOT NULL REFERENCES addresses(id) ON DELETE CASCADE,
    amount_sat INTEGER NOT NULL,
    block_time INTEGER,
    confirmed INTEGER NOT NULL DEFAULT 0,
    fetched_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(txid, address_id)
);

-- Composite covers both `WHERE address_id = ?` (leading column lookup) and
-- the hot `WHERE address_id = ? ORDER BY block_time DESC LIMIT 1` pattern
-- used by latestConfirmedTxidForAddress and the per-address modal listing.
CREATE INDEX address_transactions_address_id_block_time_idx
    ON address_transactions(address_id, block_time DESC);
-- Standalone block_time index serves the global recent-activity feed
-- (UNION ALL ORDER BY block_time DESC) where there's no address filter.
CREATE INDEX address_transactions_block_time_idx ON address_transactions(block_time DESC);

CREATE TABLE xpub_address_transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    uuid TEXT NOT NULL UNIQUE,
    txid TEXT NOT NULL,
    xpub_address_id INTEGER NOT NULL REFERENCES xpub_addresses(id) ON DELETE CASCADE,
    amount_sat INTEGER NOT NULL,
    block_time INTEGER,
    confirmed INTEGER NOT NULL DEFAULT 0,
    fetched_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(txid, xpub_address_id)
);

-- Same reasoning as the address_transactions composite above.
CREATE INDEX xpub_address_transactions_xpub_address_id_block_time_idx
    ON xpub_address_transactions(xpub_address_id, block_time DESC);
CREATE INDEX xpub_address_transactions_block_time_idx ON xpub_address_transactions(block_time DESC);

-- Timestamp of the last successful historic-transaction backfill for this
-- address / derived xpub address. NULL means we've never completed one.
-- Set after a successful upsertMany during ingestion. Lets the UI tell
-- "still fetching" from "fetched and there was no history", and tells
-- callers when the local copy was last verified against the chain.
ALTER TABLE addresses ADD COLUMN historic_transactions_fetched_at TEXT;
ALTER TABLE xpub_addresses ADD COLUMN historic_transactions_fetched_at TEXT;
