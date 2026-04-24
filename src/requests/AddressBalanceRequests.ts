import { dbExecute, dbSelect } from "../db";

export type BalanceUpdate = {
    btc: number;
    usd: number;
    txCount: number;
    fetchedAt: string;
};

export class AddressBalanceRequests {
    async findAddressIds(address: string): Promise<number[]> {
        const rows = await dbSelect<{ id: number }>("SELECT id FROM addresses WHERE address = ?", [address]);
        return rows.map((r) => r.id);
    }

    async findXpubAddressIds(address: string): Promise<number[]> {
        const rows = await dbSelect<{ id: number }>("SELECT id FROM xpub_addresses WHERE address = ?", [address]);
        return rows.map((r) => r.id);
    }

    async updateAddressLatest(id: number, update: BalanceUpdate): Promise<void> {
        await dbExecute(
            "UPDATE addresses SET latest_balance_btc = ?, latest_balance_usd = ?, latest_tx_count = ?, latest_balance_fetched_at = ?, updated_at = ? WHERE id = ?",
            [update.btc, update.usd, update.txCount, update.fetchedAt, update.fetchedAt, id],
        );
    }

    async insertAddressBalanceSnapshot(addressId: number, update: BalanceUpdate): Promise<void> {
        await dbExecute(
            "INSERT INTO address_balances (uuid, address_id, balance_btc, balance_usd, tx_count, fetched_at) VALUES (?, ?, ?, ?, ?, ?)",
            [crypto.randomUUID(), addressId, update.btc, update.usd, update.txCount, update.fetchedAt],
        );
    }

    async updateXpubAddressLatest(id: number, update: BalanceUpdate): Promise<void> {
        await dbExecute(
            "UPDATE xpub_addresses SET latest_balance_btc = ?, latest_balance_usd = ?, latest_tx_count = ?, latest_balance_fetched_at = ?, updated_at = ? WHERE id = ?",
            [update.btc, update.usd, update.txCount, update.fetchedAt, update.fetchedAt, id],
        );
    }

    async insertXpubAddressBalanceSnapshot(xpubAddressId: number, update: BalanceUpdate): Promise<void> {
        await dbExecute(
            "INSERT INTO xpub_address_balances (uuid, xpub_address_id, balance_btc, balance_usd, tx_count, fetched_at) VALUES (?, ?, ?, ?, ?, ?)",
            [crypto.randomUUID(), xpubAddressId, update.btc, update.usd, update.txCount, update.fetchedAt],
        );
    }
}
