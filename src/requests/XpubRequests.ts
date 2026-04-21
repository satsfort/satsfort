import { dbExecute, dbSelect } from "../db";
import { deriveAddressesFromExtendedKey, validateExtendedKey } from "../services/XpubDerivationService";
import type { AddressDerivationType } from "../services/XpubDerivationService";

/**
 * Supported address derivation types from an xpub/zpub.
 */
export type DerivationType = AddressDerivationType;

/**
 * Metadata for a tracked xpub/zpub.
 */
export type TrackedXpubMeta = {
    id: string;
    label: string;
    xpub: string;
    derivationType: DerivationType;
    added: string;
    addressCount: number;
};

/**
 * A derived address from an xpub/zpub.
 */
export type DerivedAddress = {
    id: string;
    xpubId: string;
    address: string;
    derivationPath: string;
    index: number;
};

type XpubRow = {
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

function rowToXpubMeta(row: XpubRow): TrackedXpubMeta {
    return {
        id: row.uuid,
        label: row.label,
        xpub: row.xpub,
        derivationType: row.derivation_type as DerivationType,
        added: row.created_at.slice(0, 10),
        addressCount: row.address_count,
    };
}

function rowToDerivedAddress(row: XpubAddressRow): DerivedAddress {
    return {
        id: row.uuid,
        xpubId: row.xpub_uuid,
        address: row.address,
        derivationPath: row.derivation_path,
        index: row.address_index,
    };
}

/**
 * Validates an xpub/zpub/ypub format.
 * Returns null if valid, or an error message string if invalid.
 */
export function validateXpub(xpub: string): string | null {
    const trimmed = xpub.trim();
    if (trimmed.length === 0) return "Extended public key is required";

    // Check for valid prefixes
    const validPrefixes = ["xpub", "ypub", "zpub", "tpub", "upub", "vpub"];
    const prefix = trimmed.slice(0, 4);

    if (!validPrefixes.includes(prefix)) {
        return "Extended public key must start with xpub, ypub, zpub (mainnet) or tpub, upub, vpub (testnet)";
    }

    // Check if it's a testnet key
    if (["tpub", "upub", "vpub"].includes(prefix)) {
        return "Testnet extended public keys are not supported. Please use a mainnet key (xpub, ypub, or zpub)";
    }

    // Basic length check (base58 encoded xpub is typically 111 characters)
    if (trimmed.length < 100 || trimmed.length > 120) {
        return "Extended public key has invalid length";
    }

    // Check for valid base58 characters
    const base58Chars = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
    for (const char of trimmed) {
        if (!base58Chars.includes(char)) {
            return `Invalid character in extended public key: '${char}'`;
        }
    }

    // Validate that the key can be parsed and used for derivation
    const derivationError = validateExtendedKey(trimmed);
    if (derivationError) {
        return derivationError;
    }

    return null;
}

/**
 * Gets the default derivation type based on the xpub prefix.
 */
export function getDefaultDerivationType(xpub: string): DerivationType {
    const prefix = xpub.trim().slice(0, 4);
    switch (prefix) {
        case "zpub":
            return "P2WPKH"; // Native SegWit (bech32)
        case "ypub":
            return "P2SH"; // Wrapped SegWit (P2SH-P2WPKH)
        case "xpub":
        default:
            return "P2PKH"; // Legacy
    }
}

export class XpubRequests {
    /**
     * Gets all tracked xpubs.
     */
    async execute(): Promise<TrackedXpubMeta[]> {
        const rows = await dbSelect<XpubRow>(
            "SELECT uuid, label, xpub, derivation_type, address_count, created_at FROM xpubs ORDER BY id",
        );
        return rows.map(rowToXpubMeta);
    }

    /**
     * Gets all derived addresses for a specific xpub.
     */
    async getDerivedAddresses(xpubId: string): Promise<DerivedAddress[]> {
        const rows = await dbSelect<XpubAddressRow>(
            "SELECT uuid, xpub_uuid, address, derivation_path, address_index FROM xpub_addresses WHERE xpub_uuid = ? ORDER BY address_index",
            [xpubId],
        );
        return rows.map(rowToDerivedAddress);
    }

    /**
     * Gets all derived addresses for all xpubs.
     */
    async getAllDerivedAddresses(): Promise<DerivedAddress[]> {
        const rows = await dbSelect<XpubAddressRow>(
            "SELECT uuid, xpub_uuid, address, derivation_path, address_index FROM xpub_addresses ORDER BY xpub_uuid, address_index",
        );
        return rows.map(rowToDerivedAddress);
    }

    /**
     * Adds a new xpub and derives addresses from it.
     */
    async add(
        xpub: string,
        label: string,
        derivationType: DerivationType,
    ): Promise<{ xpub: TrackedXpubMeta; addresses: DerivedAddress[] }> {
        const trimmedXpub = xpub.trim();
        const trimmedLabel = label.trim();

        const error = validateXpub(trimmedXpub);
        if (error) throw new Error(error);

        if (trimmedLabel.length === 0) throw new Error("Label is required");

        const existing = await dbSelect<{ uuid: string }>("SELECT uuid FROM xpubs WHERE xpub = ?", [trimmedXpub]);
        if (existing.length > 0) {
            throw new Error("This extended public key is already being tracked");
        }

        const addressCount = 20;
        const xpubUuid = crypto.randomUUID();

        await dbExecute(
            "INSERT INTO xpubs (uuid, label, xpub, derivation_type, address_count) VALUES (?, ?, ?, ?, ?)",
            [xpubUuid, trimmedLabel, trimmedXpub, derivationType, addressCount],
        );

        const derivedInfos = deriveAddressesFromExtendedKey(trimmedXpub, derivationType, addressCount);
        const derivedAddresses: DerivedAddress[] = [];
        for (const info of derivedInfos) {
            const addressUuid = crypto.randomUUID();
            await dbExecute(
                "INSERT INTO xpub_addresses (uuid, xpub_uuid, address, derivation_path, address_index) VALUES (?, ?, ?, ?, ?)",
                [addressUuid, xpubUuid, info.address, info.derivationPath, info.index],
            );
            derivedAddresses.push({
                id: addressUuid,
                xpubId: xpubUuid,
                address: info.address,
                derivationPath: info.derivationPath,
                index: info.index,
            });
        }

        const xpubRows = await dbSelect<XpubRow>(
            "SELECT uuid, label, xpub, derivation_type, address_count, created_at FROM xpubs WHERE uuid = ?",
            [xpubUuid],
        );

        return { xpub: rowToXpubMeta(xpubRows[0]), addresses: derivedAddresses };
    }

    /**
     * Removes an xpub and all its derived addresses.
     */
    async remove(id: string): Promise<void> {
        await dbExecute("DELETE FROM xpub_addresses WHERE xpub_uuid = ?", [id]);
        await dbExecute("DELETE FROM xpubs WHERE uuid = ?", [id]);
    }
}
