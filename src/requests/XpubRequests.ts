import { Config } from "../lib/Config";
import { dbExecute, dbSelect } from "../db";
import { MOCK_XPUB, MOCK_XPUB_DERIVED } from "../lib/mockData";
import type { AddressDerivationType } from "../services/model/AddressDerivationType";
import type { TrackedXpubMeta } from "../services/model/TrackedXpubMeta";
import type { DerivedAddress } from "../services/model/DerivedAddress";
import type { XpubBalanceUpdate } from "../services/model/XpubBalanceUpdate";

type XpubRow = {
    id: number;
    uuid: string;
    label: string;
    xpub: string;
    derivation_type: string;
    address_count: number;
    created_at: string;
};

type XpubAddressRow = {
    uuid: string;
    xpub_uuid: string;
    address: string;
    derivation_path: string;
    address_index: number;
};

export class XpubRequests {
    async getAll(): Promise<TrackedXpubMeta[]> {
        if (Config.useMockData) {
            return [
                {
                    id: MOCK_XPUB.id,
                    label: MOCK_XPUB.label,
                    xpub: MOCK_XPUB.xpub,
                    derivationType: MOCK_XPUB.derivationType,
                    added: MOCK_XPUB.added,
                    addressCount: MOCK_XPUB.addressCount,
                },
            ];
        }
        const rows = await dbSelect<XpubRow>(
            "SELECT id, uuid, label, xpub, derivation_type, address_count, created_at FROM xpubs ORDER BY id",
        );
        return rows.map(this.rowToXpubMeta);
    }

    async getDerivedAddresses(xpubId: string): Promise<DerivedAddress[]> {
        const rows = await dbSelect<XpubAddressRow>(
            "SELECT xa.uuid, x.uuid AS xpub_uuid, xa.address, xa.derivation_path, xa.address_index FROM xpub_addresses xa JOIN xpubs x ON xa.xpub_id = x.id WHERE x.uuid = ? ORDER BY xa.address_index",
            [xpubId],
        );
        return rows.map(this.rowToDerivedAddress);
    }

    async getAllDerivedAddresses(): Promise<DerivedAddress[]> {
        if (Config.useMockData) {
            return MOCK_XPUB_DERIVED.map((entry) => ({
                id: entry.id,
                xpubId: MOCK_XPUB.id,
                address: entry.address,
                derivationPath: entry.derivationPath,
                index: entry.index,
            }));
        }
        const rows = await dbSelect<XpubAddressRow>(
            "SELECT xa.uuid, x.uuid AS xpub_uuid, xa.address, xa.derivation_path, xa.address_index FROM xpub_addresses xa JOIN xpubs x ON xa.xpub_id = x.id ORDER BY xa.xpub_id, xa.address_index",
        );
        return rows.map(this.rowToDerivedAddress);
    }

    async findByXpub(xpub: string): Promise<TrackedXpubMeta | null> {
        const rows = await dbSelect<XpubRow>(
            "SELECT id, uuid, label, xpub, derivation_type, address_count, created_at FROM xpubs WHERE xpub = ?",
            [xpub],
        );
        return rows.length > 0 ? this.rowToXpubMeta(rows[0]) : null;
    }

    async findInternalIdByUuid(uuid: string): Promise<number | null> {
        const rows = await dbSelect<{ id: number }>("SELECT id FROM xpubs WHERE uuid = ?", [uuid]);
        return rows.length > 0 ? rows[0].id : null;
    }

    async insertXpub(params: {
        uuid: string;
        label: string;
        xpub: string;
        derivationType: AddressDerivationType;
        addressCount: number;
    }): Promise<TrackedXpubMeta> {
        await dbExecute("INSERT INTO xpubs (uuid, label, xpub, derivation_type, address_count) VALUES (?, ?, ?, ?, ?)", [
            params.uuid,
            params.label,
            params.xpub,
            params.derivationType,
            params.addressCount,
        ]);
        const rows = await dbSelect<XpubRow>(
            "SELECT id, uuid, label, xpub, derivation_type, address_count, created_at FROM xpubs WHERE uuid = ?",
            [params.uuid],
        );
        return this.rowToXpubMeta(rows[0]);
    }

    async insertDerivedAddress(
        xpubInternalId: number,
        params: { uuid: string; xpubUuid: string; address: string; derivationPath: string; index: number },
    ): Promise<DerivedAddress> {
        await dbExecute("INSERT INTO xpub_addresses (uuid, xpub_id, address, derivation_path, address_index) VALUES (?, ?, ?, ?, ?)", [
            params.uuid,
            xpubInternalId,
            params.address,
            params.derivationPath,
            params.index,
        ]);
        return {
            id: params.uuid,
            xpubId: params.xpubUuid,
            address: params.address,
            derivationPath: params.derivationPath,
            index: params.index,
        };
    }

    async remove(id: string): Promise<void> {
        await dbExecute("DELETE FROM xpub_addresses WHERE xpub_id = (SELECT id FROM xpubs WHERE uuid = ?)", [id]);
        await dbExecute("DELETE FROM xpubs WHERE uuid = ?", [id]);
    }

    async sumDerivedBalances(xpubInternalId: number): Promise<{ btc: number; usd: number; txCount: number }> {
        const [totals] = await dbSelect<{ total_btc: number | null; total_usd: number | null; total_tx: number | null }>(
            "SELECT COALESCE(SUM(latest_balance_btc), 0) AS total_btc, COALESCE(SUM(latest_balance_usd), 0) AS total_usd, COALESCE(SUM(latest_tx_count), 0) AS total_tx FROM xpub_addresses WHERE xpub_id = ?",
            [xpubInternalId],
        );
        return { btc: totals.total_btc ?? 0, usd: totals.total_usd ?? 0, txCount: totals.total_tx ?? 0 };
    }

    async updateLatestBalance(xpubInternalId: number, update: XpubBalanceUpdate): Promise<void> {
        await dbExecute(
            "UPDATE xpubs SET latest_balance_btc = ?, latest_balance_usd = ?, latest_tx_count = ?, latest_balance_fetched_at = ?, updated_at = ? WHERE id = ?",
            [update.btc, update.usd, update.txCount, update.fetchedAt, update.fetchedAt, xpubInternalId],
        );
    }

    async insertBalanceSnapshot(xpubInternalId: number, update: XpubBalanceUpdate): Promise<void> {
        await dbExecute(
            "INSERT INTO xpub_balances (uuid, xpub_id, balance_btc, balance_usd, tx_count, fetched_at) VALUES (?, ?, ?, ?, ?, ?)",
            [crypto.randomUUID(), xpubInternalId, update.btc, update.usd, update.txCount, update.fetchedAt],
        );
    }

    private rowToXpubMeta(row: XpubRow): TrackedXpubMeta {
        return {
            id: row.uuid,
            label: row.label,
            xpub: row.xpub,
            derivationType: row.derivation_type as AddressDerivationType,
            added: row.created_at.slice(0, 10),
            addressCount: row.address_count,
        };
    }

    private rowToDerivedAddress(row: XpubAddressRow): DerivedAddress {
        return {
            id: row.uuid,
            xpubId: row.xpub_uuid,
            address: row.address,
            derivationPath: row.derivation_path,
            index: row.address_index,
        };
    }
}
