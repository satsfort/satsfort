import { Config } from "../lib/Config";
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

const MOCK_ADDRESSES: TrackedAddressMeta[] = [
    {
        id: "a1",
        label: "Cold Storage · Coldcard Mk4",
        address: "bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh",
        type: "Segwit",
        added: "2024-05-02",
        xpub: true,
    },
    {
        id: "a2",
        label: "Savings · Jade",
        address: "bc1pqqqsyqcyq5rqwzqfpg9scrgwpugpzysnzs23v9ccrydpk8qarc0sj9hjuh",
        type: "Taproot",
        added: "2024-09-14",
    },
    {
        id: "a3",
        label: "Hot Wallet · Strike",
        address: "bc1q34aq5drpuwy3wgl9lhup9892qp6svr8ldzyy7c",
        type: "Segwit",
        added: "2025-01-10",
    },
    {
        id: "a4",
        label: "Legacy Stack",
        address: "1F1tAaz5x1HUXrCNLbtMDqcw6o5GNn4xqX",
        type: "Legacy",
        added: "2024-04-18",
    },
    {
        id: "a5",
        label: "Lightning Collateral",
        address: "bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq",
        type: "Segwit",
        added: "2025-07-22",
    },
];

// In-memory store for user-added addresses
const userAddresses: TrackedAddressMeta[] = [];

let nextId = 1;

export class TrackedAddressesRequests {
    async execute(): Promise<TrackedAddressMeta[]> {
        if (Config.useMockData) {
            return [...MOCK_ADDRESSES, ...userAddresses];
        }
        return [...userAddresses];
    }

    async add(address: string, label: string): Promise<TrackedAddressMeta> {
        const trimmedAddress = address.trim();
        const trimmedLabel = label.trim();

        const error = await validateBitcoinAddress(trimmedAddress);
        if (error) throw new Error(error);

        if (trimmedLabel.length === 0) throw new Error("Label is required");

        // Check for duplicates
        const all = Config.useMockData ? [...MOCK_ADDRESSES, ...userAddresses] : [...userAddresses];
        if (all.some((a) => a.address === trimmedAddress)) {
            throw new Error("This address is already being tracked");
        }

        const meta: TrackedAddressMeta = {
            id: `user-${nextId++}`,
            label: trimmedLabel,
            address: trimmedAddress,
            type: detectAddressType(trimmedAddress),
            added: new Date().toISOString().slice(0, 10),
        };

        userAddresses.push(meta);
        return meta;
    }

    async remove(id: string): Promise<void> {
        const index = userAddresses.findIndex((a) => a.id === id);
        if (index !== -1) {
            userAddresses.splice(index, 1);
        }
    }
}
