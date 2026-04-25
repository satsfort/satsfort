import type { AddressType } from "../services/model/AddressType";
import type { AddressDerivationType } from "../services/model/AddressDerivationType";

export type MockBalanceEntry = {
    address: string;
    btc: number;
    txCount: number;
    lastSeen: string;
};

export type MockTrackedAddress = MockBalanceEntry & {
    id: string;
    label: string;
    type: AddressType;
    added: string;
};

export type MockDerivedAddressEntry = MockBalanceEntry & {
    id: string;
    index: number;
    derivationPath: string;
};

/**
 * Two standalone tracked addresses used in mock mode. Their balances
 * combined with the xpub-derived balances below total {@link MOCK_TARGET_BTC}.
 */
export const MOCK_TRACKED_ADDRESSES: MockTrackedAddress[] = [
    {
        id: "mock-tracked-1",
        label: "Cold storage",
        type: "Segwit",
        address: "bc1qmockcoldstorage9z7w6vupkq3ldnt29q4q4r5x",
        added: "2024-09-15",
        btc: 0.5,
        txCount: 7,
        lastSeen: "2026-04-22",
    },
    {
        id: "mock-tracked-2",
        label: "Trading wallet",
        type: "Segwit",
        address: "bc1qmocktrading6dy9p2yfp3xnwzwjsfwd44ne9py6",
        added: "2025-02-20",
        btc: 0.4,
        txCount: 12,
        lastSeen: "2026-04-24",
    },
];

/** Single xpub used in mock mode. */
export const MOCK_XPUB = {
    id: "mock-xpub-1",
    label: "Hardware wallet",
    xpub: "zpub6mockmockmockxpubvalue1234567890mockmockmockmockmockmockmockmockmockmockmockmockmockmockmockmock",
    derivationType: "P2WPKH" as AddressDerivationType,
    added: "2024-12-01",
    addressCount: 20,
};

const FUNDED_DERIVED: MockDerivedAddressEntry[] = [
    {
        id: "mock-derived-0",
        index: 0,
        derivationPath: "m/84'/0'/0'/0/0",
        address: "bc1qmockxpub00qm6dy9p2yfp3xnwzwjsfwd44ne9p",
        btc: 0.6,
        txCount: 4,
        lastSeen: "2026-04-20",
    },
    {
        id: "mock-derived-1",
        index: 1,
        derivationPath: "m/84'/0'/0'/0/1",
        address: "bc1qmockxpub016dy9p2yfp3xnwzwjsfwd44ne9pyx",
        btc: 0.4,
        txCount: 2,
        lastSeen: "2026-04-18",
    },
    {
        id: "mock-derived-2",
        index: 2,
        derivationPath: "m/84'/0'/0'/0/2",
        address: "bc1qmockxpub02ky9p2yfp3xnwzwjsfwd44ne9py6x",
        btc: 0.2,
        txCount: 1,
        lastSeen: "2026-04-12",
    },
];

const EMPTY_DERIVED: MockDerivedAddressEntry[] = Array.from({ length: MOCK_XPUB.addressCount - FUNDED_DERIVED.length }, (_, i) => {
    const idx = i + FUNDED_DERIVED.length;
    return {
        id: `mock-derived-${idx}`,
        index: idx,
        derivationPath: `m/84'/0'/0'/0/${idx}`,
        address: `bc1qmockxpub${String(idx).padStart(2, "0")}empty9z7w6vupkq3ldnt29q4q4r5x`,
        btc: 0,
        txCount: 0,
        lastSeen: "-",
    };
});

export const MOCK_XPUB_DERIVED: MockDerivedAddressEntry[] = [...FUNDED_DERIVED, ...EMPTY_DERIVED];

/**
 * Lookup map used by BlockchainBalanceRequests' mock branch — keyed by the
 * raw address so the same balance information surfaces regardless of whether
 * a UI consumer asked for a tracked address or a derived xpub address.
 */
export const MOCK_BALANCE_BY_ADDRESS: Record<string, MockBalanceEntry> = Object.fromEntries(
    [...MOCK_TRACKED_ADDRESSES, ...MOCK_XPUB_DERIVED].map((entry) => [
        entry.address,
        { address: entry.address, btc: entry.btc, txCount: entry.txCount, lastSeen: entry.lastSeen },
    ]),
);

export const MOCK_TARGET_BTC = [...MOCK_TRACKED_ADDRESSES, ...MOCK_XPUB_DERIVED].reduce((sum, entry) => sum + entry.btc, 0);
