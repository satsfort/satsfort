import { Config } from "../lib/Config";
import { dbExecute, dbSelect } from "../db";
import type { RawTransaction } from "../services/model/RawTransaction";

export type TransactionRow = {
    uuid: string;
    txid: string;
    amount_sat: number;
    block_time: number | null;
    confirmed: number;
    label: string;
};

export type TransactionTarget = { kind: "address"; addressId: number } | { kind: "xpubAddress"; xpubAddressId: number };

const INSERT_CHUNK_SIZE = 200;

type TableSpec = { table: string; ownerColumn: string };

function tableSpec(target: TransactionTarget): TableSpec {
    return target.kind === "address"
        ? { table: "address_transactions", ownerColumn: "address_id" }
        : { table: "xpub_address_transactions", ownerColumn: "xpub_address_id" };
}

export class TransactionHistoryRequests {
    /**
     * Inserts (or upserts) a batch of transactions for a single owning entity
     * (one address row, or one xpub_addresses row). Pending txs (confirmed=0,
     * block_time=NULL) are promoted to confirmed when seen again with a
     * block_time. amount_sat is an immutable property of a txid so we don't
     * overwrite it.
     */
    async upsertMany(target: TransactionTarget, transactions: RawTransaction[]): Promise<void> {
        if (Config.useMockData) return;
        if (transactions.length === 0) return;

        const { table, ownerColumn } = tableSpec(target);
        const ownerId = target.kind === "address" ? target.addressId : target.xpubAddressId;

        for (let i = 0; i < transactions.length; i += INSERT_CHUNK_SIZE) {
            const chunk = transactions.slice(i, i + INSERT_CHUNK_SIZE);
            const placeholders = chunk.map(() => "(?, ?, ?, ?, ?, ?)").join(",");
            const params: (string | number | null)[] = [];
            for (const tx of chunk) {
                params.push(crypto.randomUUID(), tx.txid, ownerId, tx.amountSat, tx.blockTime, tx.confirmed ? 1 : 0);
            }
            const sql =
                `INSERT INTO ${table} (uuid, txid, ${ownerColumn}, amount_sat, block_time, confirmed) VALUES ${placeholders} ` +
                `ON CONFLICT(txid, ${ownerColumn}) DO UPDATE SET ` +
                `block_time = excluded.block_time, confirmed = excluded.confirmed, fetched_at = datetime('now')`;
            await dbExecute(sql, params);
        }
    }

    /**
     * Returns the most recent transactions across every tracked address and
     * xpub-derived address, joined to the owning label so the UI can show the
     * source name without a second lookup. Pending txs (block_time NULL)
     * sort to the top via the COALESCE.
     */
    async listRecent(limit: number): Promise<TransactionRow[]> {
        if (Config.useMockData) return [];
        return dbSelect<TransactionRow>(
            `SELECT * FROM (
                SELECT t.uuid, t.txid, t.amount_sat, t.block_time, t.confirmed, t.fetched_at,
                       a.label AS label
                FROM address_transactions t
                JOIN addresses a ON t.address_id = a.id
                UNION ALL
                SELECT t.uuid, t.txid, t.amount_sat, t.block_time, t.confirmed, t.fetched_at,
                       x.label AS label
                FROM xpub_address_transactions t
                JOIN xpub_addresses xa ON t.xpub_address_id = xa.id
                JOIN xpubs x ON xa.xpub_id = x.id
             )
             ORDER BY COALESCE(block_time, 9999999999) DESC, fetched_at DESC, uuid DESC
             LIMIT ?`,
            [limit],
        );
    }

    /**
     * Returns a page of transactions for a single tracked address (looked up
     * by the address-table uuid), ordered most-recent first.
     */
    async listForAddressUuid(addressUuid: string, limit: number, offset: number = 0): Promise<TransactionRow[]> {
        if (Config.useMockData) return [];
        return dbSelect<TransactionRow>(
            `SELECT t.uuid, t.txid, t.amount_sat, t.block_time, t.confirmed, a.label AS label
             FROM address_transactions t
             JOIN addresses a ON t.address_id = a.id
             WHERE a.uuid = ?
             ORDER BY COALESCE(t.block_time, 9999999999) DESC, t.id DESC
             LIMIT ? OFFSET ?`,
            [addressUuid, limit, offset],
        );
    }

    async countForAddressUuid(addressUuid: string): Promise<number> {
        if (Config.useMockData) return 0;
        const rows = await dbSelect<{ count: number }>(
            `SELECT COUNT(*) AS count
             FROM address_transactions t
             JOIN addresses a ON t.address_id = a.id
             WHERE a.uuid = ?`,
            [addressUuid],
        );
        return rows[0]?.count ?? 0;
    }

    /**
     * Stamps the address row with the time of its latest successful historic
     * transaction backfill. Called after a successful upsertMany. NULL means
     * we've never completed one.
     */
    async markAddressHistoricFetched(addressInternalId: number): Promise<void> {
        if (Config.useMockData) return;
        await dbExecute(
            "UPDATE addresses SET historic_transactions_fetched_at = datetime('now'), updated_at = datetime('now') WHERE id = ?",
            [addressInternalId],
        );
    }

    async markXpubAddressHistoricFetched(xpubAddressId: number): Promise<void> {
        if (Config.useMockData) return;
        await dbExecute(
            "UPDATE xpub_addresses SET historic_transactions_fetched_at = datetime('now'), updated_at = datetime('now') WHERE id = ?",
            [xpubAddressId],
        );
    }

    async deleteForAddressUuid(addressUuid: string): Promise<void> {
        if (Config.useMockData) return;
        await dbExecute(
            "DELETE FROM address_transactions WHERE address_id = (SELECT id FROM addresses WHERE uuid = ?)",
            [addressUuid],
        );
    }

    async deleteForXpubUuid(xpubUuid: string): Promise<void> {
        if (Config.useMockData) return;
        await dbExecute(
            "DELETE FROM xpub_address_transactions WHERE xpub_address_id IN (SELECT id FROM xpub_addresses WHERE xpub_id = (SELECT id FROM xpubs WHERE uuid = ?))",
            [xpubUuid],
        );
    }

    /**
     * Returns the txid of the most-recent confirmed transaction we have for
     * this address, or null if the address has no confirmed transactions.
     * Used as the stop marker for incremental refreshes — pending txs are
     * excluded so the marker is stable across re-broadcasts.
     */
    async latestConfirmedTxidForAddress(addressInternalId: number): Promise<string | null> {
        if (Config.useMockData) return null;
        const rows = await dbSelect<{ txid: string }>(
            `SELECT txid FROM address_transactions
             WHERE address_id = ? AND block_time IS NOT NULL
             ORDER BY block_time DESC, id DESC
             LIMIT 1`,
            [addressInternalId],
        );
        return rows[0]?.txid ?? null;
    }

    async latestConfirmedTxidForXpubAddress(xpubAddressId: number): Promise<string | null> {
        if (Config.useMockData) return null;
        const rows = await dbSelect<{ txid: string }>(
            `SELECT txid FROM xpub_address_transactions
             WHERE xpub_address_id = ? AND block_time IS NOT NULL
             ORDER BY block_time DESC, id DESC
             LIMIT 1`,
            [xpubAddressId],
        );
        return rows[0]?.txid ?? null;
    }

    async findAddressInternalIdByUuid(uuid: string): Promise<number | null> {
        if (Config.useMockData) return null;
        const rows = await dbSelect<{ id: number }>("SELECT id FROM addresses WHERE uuid = ?", [uuid]);
        return rows.length > 0 ? rows[0].id : null;
    }

    async findXpubAddressIdsByXpubUuid(xpubUuid: string): Promise<{ id: number; address: string }[]> {
        if (Config.useMockData) return [];
        return dbSelect<{ id: number; address: string }>(
            "SELECT xa.id, xa.address FROM xpub_addresses xa JOIN xpubs x ON xa.xpub_id = x.id WHERE x.uuid = ? ORDER BY xa.address_index",
            [xpubUuid],
        );
    }
}
