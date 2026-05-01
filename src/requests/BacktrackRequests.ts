import { Config } from "../lib/Config";
import { dbExecute, dbSelect } from "../db";
import type { DailyBalanceSnapshot } from "../services/model/DailyBalanceSnapshot";

export type ConfirmedTxRow = { amount_sat: number; block_time: number };
export type DerivedAddressRow = { id: number; address: string };
export type BalanceSnapshotRow = { ownerId: number; balanceBtc: number; fetchedAt: string };

const INSERT_CHUNK_SIZE = 200;

export class BacktrackRequests {
    async findAddressInternalIdByUuid(uuid: string): Promise<number | null> {
        if (Config.useMockData) return null;
        const rows = await dbSelect<{ id: number }>("SELECT id FROM addresses WHERE uuid = ?", [uuid]);
        return rows.length > 0 ? rows[0].id : null;
    }

    async findXpubInternalIdByUuid(uuid: string): Promise<number | null> {
        if (Config.useMockData) return null;
        const rows = await dbSelect<{ id: number }>("SELECT id FROM xpubs WHERE uuid = ?", [uuid]);
        return rows.length > 0 ? rows[0].id : null;
    }

    async getDerivedAddressesForXpub(xpubInternalId: number): Promise<DerivedAddressRow[]> {
        if (Config.useMockData) return [];
        return dbSelect<DerivedAddressRow>("SELECT id, address FROM xpub_addresses WHERE xpub_id = ? ORDER BY address_index", [
            xpubInternalId,
        ]);
    }

    /**
     * Confirmed (block_time IS NOT NULL) transactions for a tracked address.
     * Pending txs are excluded — they have no point-in-time anchor and would
     * pollute the daily balance series with phantom values that vanish when
     * the tx confirms in a different day.
     */
    async getConfirmedTransactionsForAddress(addressId: number): Promise<ConfirmedTxRow[]> {
        if (Config.useMockData) return [];
        return dbSelect<ConfirmedTxRow>(
            "SELECT amount_sat, block_time FROM address_transactions WHERE address_id = ? AND block_time IS NOT NULL ORDER BY block_time ASC",
            [addressId],
        );
    }

    async getConfirmedTransactionsForXpubAddress(xpubAddressId: number): Promise<ConfirmedTxRow[]> {
        if (Config.useMockData) return [];
        return dbSelect<ConfirmedTxRow>(
            "SELECT amount_sat, block_time FROM xpub_address_transactions WHERE xpub_address_id = ? AND block_time IS NOT NULL ORDER BY block_time ASC",
            [xpubAddressId],
        );
    }

    /**
     * Replaces the historical (pre-today) `address_balances` rows for a single
     * address with the supplied daily snapshots. Live "now" rows written by
     * the live balance flow are preserved by the `fetched_at < ?` cutoff.
     */
    async replaceAddressHistoricalBalances(addressId: number, snapshots: DailyBalanceSnapshot[]): Promise<void> {
        if (Config.useMockData) return;

        const todayCutoff = todayStartIso();
        await dbExecute("DELETE FROM address_balances WHERE address_id = ? AND fetched_at < ?", [addressId, todayCutoff]);
        await this.insertSnapshots("address_balances", "address_id", addressId, snapshots);
    }

    async replaceXpubAddressHistoricalBalances(xpubAddressId: number, snapshots: DailyBalanceSnapshot[]): Promise<void> {
        if (Config.useMockData) return;

        const todayCutoff = todayStartIso();
        await dbExecute("DELETE FROM xpub_address_balances WHERE xpub_address_id = ? AND fetched_at < ?", [xpubAddressId, todayCutoff]);
        await this.insertSnapshots("xpub_address_balances", "xpub_address_id", xpubAddressId, snapshots);
    }

    async replaceXpubHistoricalBalances(xpubId: number, snapshots: DailyBalanceSnapshot[]): Promise<void> {
        if (Config.useMockData) return;

        const todayCutoff = todayStartIso();
        await dbExecute("DELETE FROM xpub_balances WHERE xpub_id = ? AND fetched_at < ?", [xpubId, todayCutoff]);
        await this.insertSnapshots("xpub_balances", "xpub_id", xpubId, snapshots);
    }

    /**
     * All historical (pre-today) address balance snapshots, ordered by owner
     * then time. Used by the portfolio rebuild to walk every entity's history
     * in one pass instead of running a query per (address, date) cell.
     */
    async getAllAddressBalanceSnapshots(): Promise<{ address_id: number; balance_btc: number; fetched_at: string }[]> {
        if (Config.useMockData) return [];
        return dbSelect<{ address_id: number; balance_btc: number; fetched_at: string }>(
            "SELECT address_id, balance_btc, fetched_at FROM address_balances ORDER BY address_id, fetched_at ASC",
        );
    }

    async getAllXpubBalanceSnapshots(): Promise<{ xpub_id: number; balance_btc: number; fetched_at: string }[]> {
        if (Config.useMockData) return [];
        return dbSelect<{ xpub_id: number; balance_btc: number; fetched_at: string }>(
            "SELECT xpub_id, balance_btc, fetched_at FROM xpub_balances ORDER BY xpub_id, fetched_at ASC",
        );
    }

    async getPricesForDates(dates: string[]): Promise<Map<string, number>> {
        if (Config.useMockData || dates.length === 0) return new Map();
        const placeholders = dates.map(() => "?").join(",");
        const rows = await dbSelect<{ date: string; price: number }>(
            `SELECT date, price FROM historical_prices WHERE date IN (${placeholders})`,
            dates,
        );
        return new Map(rows.map((r) => [r.date, r.price]));
    }

    async wipePortfolioValues(): Promise<void> {
        if (Config.useMockData) return;
        await dbExecute("DELETE FROM portfolio_value");
    }

    async insertPortfolioValueSnapshots(rows: { btc: number; usd: number; fetchedAt: string }[]): Promise<void> {
        if (Config.useMockData) return;
        if (rows.length === 0) return;

        for (let i = 0; i < rows.length; i += INSERT_CHUNK_SIZE) {
            const chunk = rows.slice(i, i + INSERT_CHUNK_SIZE);
            const placeholders = chunk.map(() => "(?, ?, ?, ?)").join(",");
            const params: (string | number)[] = [];
            for (const r of chunk) {
                params.push(crypto.randomUUID(), r.btc, r.usd, r.fetchedAt);
            }
            await dbExecute(`INSERT INTO portfolio_value (uuid, balance_btc, balance_usd, fetched_at) VALUES ${placeholders}`, params);
        }
    }

    private async insertSnapshots(
        table: "address_balances" | "xpub_address_balances" | "xpub_balances",
        ownerColumn: string,
        ownerId: number,
        snapshots: DailyBalanceSnapshot[],
    ): Promise<void> {
        if (snapshots.length === 0) return;
        for (let i = 0; i < snapshots.length; i += INSERT_CHUNK_SIZE) {
            const chunk = snapshots.slice(i, i + INSERT_CHUNK_SIZE);
            const placeholders = chunk.map(() => "(?, ?, ?, ?, ?, ?)").join(",");
            const params: (string | number)[] = [];
            for (const s of chunk) {
                params.push(crypto.randomUUID(), ownerId, s.balanceBtc, s.balanceUsd, s.txCount, s.fetchedAt);
            }
            await dbExecute(
                `INSERT INTO ${table} (uuid, ${ownerColumn}, balance_btc, balance_usd, tx_count, fetched_at) VALUES ${placeholders}`,
                params,
            );
        }
    }
}

function todayStartIso(): string {
    const now = new Date();
    const y = now.getUTCFullYear();
    const m = String(now.getUTCMonth() + 1).padStart(2, "0");
    const d = String(now.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${d}T00:00:00Z`;
}
