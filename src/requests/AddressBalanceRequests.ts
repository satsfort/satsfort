import { Config } from "../lib/Config";

export type AddressBalance = {
  address: string;
  btc: number;
  txCount: number;
  lastSeen: string;
};

const MOCK_BALANCES: Record<
  string,
  { btc: number; txCount: number; lastSeen: string }
> = {
  "bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh": {
    btc: 1.24038211,
    txCount: 14,
    lastSeen: "2026-04-10",
  },
  "bc1pqqqsyqcyq5rqwzqfpg9scrgwpugpzysnzs23v9ccrydpk8qarc0sj9hjuh": {
    btc: 0.512,
    txCount: 22,
    lastSeen: "2026-04-08",
  },
  "bc1q34aq5drpuwy3wgl9lhup9892qp6svr8ldzyy7c": {
    btc: 0.0821045,
    txCount: 47,
    lastSeen: "2026-04-16",
  },
  "1F1tAaz5x1HUXrCNLbtMDqcw6o5GNn4xqX": {
    btc: 0.24651339,
    txCount: 3,
    lastSeen: "2025-12-20",
  },
  "bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq": {
    btc: 0.02,
    txCount: 8,
    lastSeen: "2026-03-01",
  },
};

export class AddressBalanceRequests {
  constructor(private address: string) {}

  async execute(): Promise<AddressBalance> {
    if (!Config.useMockData) {
      // TODO: fetch real balance from blockchain API
      return { address: this.address, btc: 0, txCount: 0, lastSeen: "-" };
    }

    const mock = MOCK_BALANCES[this.address];
    if (!mock) {
      return {
        address: this.address,
        btc: 0,
        txCount: 0,
        lastSeen: "-",
      };
    }
    return {
      address: this.address,
      btc: mock.btc,
      txCount: mock.txCount,
      lastSeen: mock.lastSeen,
    };
  }
}
