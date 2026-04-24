import { dbExecute, dbSelect } from "../db";
import type { AddressType } from "../services/BitcoinAddressValidationService";

export type { AddressType };

export type TrackedAddressMeta = {
    id: string;
    label: string;
    address: string;
    type: AddressType;
    added: string;
    xpub?: boolean;
};

type AddressRow = {
    uuid: string;
    label: string;
    address: string;
    address_type: string;
    created_at: string;
};

function rowToMeta(row: AddressRow): TrackedAddressMeta {
    return {
        id: row.uuid,
        label: row.label,
        address: row.address,
        type: row.address_type as AddressType,
        added: row.created_at.slice(0, 10),
    };
}

export class TrackedAddressesRequests {
    async getAll(): Promise<TrackedAddressMeta[]> {
        const rows = await dbSelect<AddressRow>("SELECT uuid, label, address, address_type, created_at FROM addresses ORDER BY id");
        return rows.map(rowToMeta);
    }

    async findByAddress(address: string): Promise<TrackedAddressMeta | null> {
        const rows = await dbSelect<AddressRow>("SELECT uuid, label, address, address_type, created_at FROM addresses WHERE address = ?", [
            address,
        ]);
        return rows.length > 0 ? rowToMeta(rows[0]) : null;
    }

    async insert(params: { uuid: string; label: string; address: string; type: AddressType }): Promise<TrackedAddressMeta> {
        await dbExecute("INSERT INTO addresses (uuid, label, address, address_type) VALUES (?, ?, ?, ?)", [
            params.uuid,
            params.label,
            params.address,
            params.type,
        ]);
        const rows = await dbSelect<AddressRow>("SELECT uuid, label, address, address_type, created_at FROM addresses WHERE uuid = ?", [
            params.uuid,
        ]);
        return rowToMeta(rows[0]);
    }

    async remove(id: string): Promise<void> {
        await dbExecute("DELETE FROM addresses WHERE uuid = ?", [id]);
    }
}
