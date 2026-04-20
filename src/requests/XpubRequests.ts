import { Config } from "../lib/Config";
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

// In-memory store for user-added xpubs
const userXpubs: TrackedXpubMeta[] = [];
const derivedAddresses: DerivedAddress[] = [];

let nextXpubId = 1;

const MOCK_XPUBS: TrackedXpubMeta[] = [
    {
        id: "xpub-mock-1",
        label: "Hardware Wallet · Ledger",
        xpub: "zpub6rFR7y4Q2AijBEqTUquhVz398htDFrtymD9xYYfG1m4wAcvPhXNfE3EfH1r1ADqtfSdVCToUG868RvUUkgDKf31mGDtKsAYz2oz2AGutZYs",
        derivationType: "P2WPKH",
        added: "2024-03-15",
        addressCount: 20,
    },
];

const MOCK_DERIVED_ADDRESSES: DerivedAddress[] = [
    {
        id: "derived-mock-1",
        xpubId: "xpub-mock-1",
        address: "bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu",
        derivationPath: "m/84'/0'/0'/0/0",
        index: 0,
    },
    {
        id: "derived-mock-2",
        xpubId: "xpub-mock-1",
        address: "bc1qnjg0jd8228aq7ez4a38sma2lj0ywk7xj8wvqef",
        derivationPath: "m/84'/0'/0'/0/1",
        index: 1,
    },
];

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

/**
 * Derives addresses from an xpub using proper BIP32 derivation.
 */
function deriveAddressesFromXpub(
    xpubId: string,
    xpub: string,
    derivationType: DerivationType,
    count: number,
): DerivedAddress[] {
    const derivedInfos = deriveAddressesFromExtendedKey(xpub, derivationType, count);

    return derivedInfos.map((info) => ({
        id: `derived-${xpubId}-${info.index}`,
        xpubId,
        address: info.address,
        derivationPath: info.derivationPath,
        index: info.index,
    }));
}

export class XpubRequests {
    /**
     * Gets all tracked xpubs.
     */
    async execute(): Promise<TrackedXpubMeta[]> {
        if (Config.useMockData) {
            return [...MOCK_XPUBS, ...userXpubs];
        }
        return [...userXpubs];
    }

    /**
     * Gets all derived addresses for a specific xpub.
     */
    async getDerivedAddresses(xpubId: string): Promise<DerivedAddress[]> {
        if (Config.useMockData && xpubId.startsWith("xpub-mock")) {
            return MOCK_DERIVED_ADDRESSES.filter((a) => a.xpubId === xpubId);
        }
        return derivedAddresses.filter((a) => a.xpubId === xpubId);
    }

    /**
     * Gets all derived addresses for all xpubs.
     */
    async getAllDerivedAddresses(): Promise<DerivedAddress[]> {
        if (Config.useMockData) {
            return [...MOCK_DERIVED_ADDRESSES, ...derivedAddresses];
        }
        return [...derivedAddresses];
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

        // Check for duplicates
        const allXpubs = Config.useMockData ? [...MOCK_XPUBS, ...userXpubs] : [...userXpubs];
        if (allXpubs.some((x) => x.xpub === trimmedXpub)) {
            throw new Error("This extended public key is already being tracked");
        }

        const addressCount = 20;
        const id = `xpub-${nextXpubId++}`;

        const meta: TrackedXpubMeta = {
            id,
            label: trimmedLabel,
            xpub: trimmedXpub,
            derivationType,
            added: new Date().toISOString().slice(0, 10),
            addressCount,
        };

        // Derive addresses using proper BIP32 derivation
        const newAddresses = deriveAddressesFromXpub(id, trimmedXpub, derivationType, addressCount);

        userXpubs.push(meta);
        derivedAddresses.push(...newAddresses);

        return { xpub: meta, addresses: newAddresses };
    }

    /**
     * Removes an xpub and all its derived addresses.
     */
    async remove(id: string): Promise<void> {
        const xpubIndex = userXpubs.findIndex((x) => x.id === id);
        if (xpubIndex !== -1) {
            userXpubs.splice(xpubIndex, 1);
        }

        // Remove all derived addresses for this xpub
        for (let i = derivedAddresses.length - 1; i >= 0; i--) {
            if (derivedAddresses[i].xpubId === id) {
                derivedAddresses.splice(i, 1);
            }
        }
    }
}
