import { Config } from "../lib/Config";

export type AddressType = "Taproot" | "Segwit" | "Legacy";

export type TrackedAddressMeta = {
  id: string;
  label: string;
  address: string;
  type: AddressType;
  added: string;
  xpub?: boolean;
};

const ADDRESS_META: TrackedAddressMeta[] = [
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

export class TrackedAddressesRequests {
  async execute(): Promise<TrackedAddressMeta[]> {
    if (!Config.useMockData) {
      // TODO: fetch real tracked addresses from storage
      return [];
    }
    return [...ADDRESS_META];
  }
}
