import { Config } from "../lib/Config";
import { dbExecute, dbSelect } from "../db";
import type { RawTransaction } from "../services/model/RawTransaction";

export type TransactionRow = {
    uuid: string;
    txid: string;
    address_id: number | null;
    xpub_address_id: number | null;
    amount_sat: number;
    block_time: number | null;
    confirmed: number;
    label: string;
};

export type TransactionTarget = { kind: "address"; addressId: number } | { kind: "xpubAddress"; xpubAddressId: number };

const INSERT_CHUNK_SIZE = 200;

export class TransactionHistoryRequests {
    /**
     * Inserts (or upserts) a batch of transactions for a single owning entity
     * (one address row, or one xpub_addresses row). Keeps at most one row per
     * (txid, owner) pair via the table's UNIQUE constraint.
     */
    async upsertMany(target: TransactionTarget, transactions: RawTransaction[]): Promise<void> {
        if (Config.useMockData) return;
        if (transactions.length === 0) return;

        const ownerColumn = target.kind === "address" ? "address_id" : "xpub_address_id";
        const otherColumn = target.kind === "address" ? "xpub_address_id" : "address_id";
        const ownerId = target.kind === "address" ? target.addressId : target.xpubAddressId;

        for (let i = 0; i < transactions.length; i += INSERT_CHUNK_SIZE) {
            const chunk = transactions.slice(i, i + INSERT_CHUNK_SIZE);
            const placeholders = chunk.map(() => "(?, ?, ?, NULL, ?, ?, ?)").join(",");
            const params: (string | number | null)[] = [];
            for (const tx of chunk) {
                params.push(crypto.randomUUID(), tx.txid, ownerId, tx.amountSat, tx.blockTime, tx.confirmed ? 1 : 0);
            }
            const sql = `INSERT OR IGNORE INTO transactions (uuid, txid, ${ownerColumn}, ${otherColumn}, amount_sat, block_time, confirmed) VALUES ${placeholders}`;
            await dbExecute(sql, params);
        }
    }

    /**
     * Returns the most recent transactions across every tracked address and
     * xpub-derived address, joined to the owning label so the UI can show the
     * source name without a second lookup.
     */
    async listRecent(limit: number): Promise<TransactionRow[]> {
        if (Config.useMockData) return [];
        return dbSelect<TransactionRow>(
            `SELECT t.uuid, t.txid, t.address_id, t.xpub_address_id, t.amount_sat, t.block_time, t.confirmed,
                    COALESCE(a.label, x.label) AS label
             FROM transactions t
             LEFT JOIN addresses a ON t.address_id = a.id
             LEFT JOIN xpub_addresses xa ON t.xpub_address_id = xa.id
             LEFT JOIN xpubs x ON xa.xpub_id = x.id
             ORDER BY COALESCE(t.block_time, 9999999999) DESC, t.id DESC
             LIMIT ?`,
            [limit],
        );
    }

    async deleteForAddressUuid(addressUuid: string): Promise<void> {
        if (Config.useMockData) return;
        await dbExecute("DELETE FROM transactions WHERE address_id = (SELECT id FROM addresses WHERE uuid = ?)", [addressUuid]);
    }

    async deleteForXpubUuid(xpubUuid: string): Promise<void> {
        if (Config.useMockData) return;
        await dbExecute(
            "DELETE FROM transactions WHERE xpub_address_id IN (SELECT id FROM xpub_addresses WHERE xpub_id = (SELECT id FROM xpubs WHERE uuid = ?))",
            [xpubUuid],
        );
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
