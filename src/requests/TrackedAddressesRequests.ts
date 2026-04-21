import { dbExecute, dbSelect } from "../db";
import { validateBitcoinAddress, detectAddressType } from "../services/BitcoinAddressValidationService";
import type { AddressType } from "../services/BitcoinAddressValidationService";

export { validateBitcoinAddress, detectAddressType };
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
    async execute(): Promise<TrackedAddressMeta[]> {
        const rows = await dbSelect<AddressRow>("SELECT uuid, label, address, address_type, created_at FROM addresses ORDER BY id");
        return rows.map(rowToMeta);
    }

    async add(address: string, label: string): Promise<TrackedAddressMeta> {
        const trimmedAddress = address.trim();
        const trimmedLabel = label.trim();

        const error = await validateBitcoinAddress(trimmedAddress);
        if (error) throw new Error(error);

        if (trimmedLabel.length === 0) throw new Error("Label is required");

        const existing = await dbSelect<{ uuid: string }>("SELECT uuid FROM addresses WHERE address = ?", [trimmedAddress]);
        if (existing.length > 0) {
            throw new Error("This address is already being tracked");
        }

        const uuid = crypto.randomUUID();
        const type = detectAddressType(trimmedAddress);

        await dbExecute("INSERT INTO addresses (uuid, label, address, address_type) VALUES (?, ?, ?, ?)", [
            uuid,
            trimmedLabel,
            trimmedAddress,
            type,
        ]);

        const rows = await dbSelect<AddressRow>("SELECT uuid, label, address, address_type, created_at FROM addresses WHERE uuid = ?", [
            uuid,
        ]);
        return rowToMeta(rows[0]);
    }

    async remove(id: string): Promise<void> {
        await dbExecute("DELETE FROM addresses WHERE uuid = ?", [id]);
    }
}
