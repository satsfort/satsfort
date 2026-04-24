import { Config } from "../lib/Config";
import type { AddressBalance } from "../services/model/AddressBalance";

const MOCK_BALANCES: Record<string, { btc: number; txCount: number; lastSeen: string }> = {
    bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh: {
        btc: 1.24038211,
        txCount: 14,
        lastSeen: "2026-04-10",
    },
    bc1pqqqsyqcyq5rqwzqfpg9scrgwpugpzysnzs23v9ccrydpk8qarc0sj9hjuh: {
        btc: 0.512,
        txCount: 22,
        lastSeen: "2026-04-08",
    },
    bc1q34aq5drpuwy3wgl9lhup9892qp6svr8ldzyy7c: {
        btc: 0.0821045,
        txCount: 47,
        lastSeen: "2026-04-16",
    },
    "1F1tAaz5x1HUXrCNLbtMDqcw6o5GNn4xqX": {
        btc: 0.24651339,
        txCount: 3,
        lastSeen: "2025-12-20",
    },
    bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq: {
        btc: 0.02,
        txCount: 8,
        lastSeen: "2026-03-01",
    },
};

/**
 * Configuration for a public blockchain API endpoint.
 * These are public Electrum-compatible HTTP APIs that provide address balance data.
 */
type ElectrumApiEndpoint = {
    name: string;
    baseUrl: string;
    getAddressUrl: (address: string) => string;
    parseResponse: (data: unknown) => { confirmed: number; unconfirmed: number; txCount: number };
};

/**
 * Public blockchain APIs that expose Electrum server data via HTTP.
 * These are rotated to avoid rate limits and provide fallback in case one fails.
 */
const ELECTRUM_API_ENDPOINTS: ElectrumApiEndpoint[] = [
    {
        name: "mempool.space",
        baseUrl: "https://mempool.space/api",
        getAddressUrl: (address: string) => `https://mempool.space/api/address/${address}`,
        parseResponse: (data: unknown) => {
            const d = data as {
                chain_stats: { funded_txo_sum: number; spent_txo_sum: number; tx_count: number };
                mempool_stats: { funded_txo_sum: number; spent_txo_sum: number; tx_count: number };
            };
            const confirmedBalance = d.chain_stats.funded_txo_sum - d.chain_stats.spent_txo_sum;
            const unconfirmedBalance = d.mempool_stats.funded_txo_sum - d.mempool_stats.spent_txo_sum;
            return {
                confirmed: confirmedBalance,
                unconfirmed: unconfirmedBalance,
                txCount: d.chain_stats.tx_count + d.mempool_stats.tx_count,
            };
        },
    },
    {
        name: "blockstream.info",
        baseUrl: "https://blockstream.info/api",
        getAddressUrl: (address: string) => `https://blockstream.info/api/address/${address}`,
        parseResponse: (data: unknown) => {
            const d = data as {
                chain_stats: { funded_txo_sum: number; spent_txo_sum: number; tx_count: number };
                mempool_stats: { funded_txo_sum: number; spent_txo_sum: number; tx_count: number };
            };
            const confirmedBalance = d.chain_stats.funded_txo_sum - d.chain_stats.spent_txo_sum;
            const unconfirmedBalance = d.mempool_stats.funded_txo_sum - d.mempool_stats.spent_txo_sum;
            return {
                confirmed: confirmedBalance,
                unconfirmed: unconfirmedBalance,
                txCount: d.chain_stats.tx_count + d.mempool_stats.tx_count,
            };
        },
    },
    {
        name: "blockchain.info",
        baseUrl: "https://blockchain.info",
        getAddressUrl: (address: string) => `https://blockchain.info/rawaddr/${address}?limit=0`,
        parseResponse: (data: unknown) => {
            const d = data as {
                final_balance: number;
                n_tx: number;
            };
            return {
                confirmed: d.final_balance,
                unconfirmed: 0,
                txCount: d.n_tx,
            };
        },
    },
];

const FAILURE_COOLDOWN_MS = 60_000; // 1 minute cooldown after failure

export class BlockchainBalanceRequests {
    /**
     * Tracks the current endpoint index for round-robin rotation.
     * This helps distribute load across APIs and avoid rate limits.
     */
    private currentEndpointIndex = 0;

    /**
     * Tracks failed endpoints to avoid retrying them too soon.
     * Maps endpoint index to failure timestamp.
     */
    private failedEndpoints = new Map<number, number>();

    async get(address: string): Promise<AddressBalance> {
        if (Config.useMockData) return this.mockBalance(address);
        return this.fetchFromElectrum(address);
    }

    /**
     * Gets the next available endpoint, considering cooldowns for failed ones.
     */
    private getNextEndpoint(): ElectrumApiEndpoint | null {
        const now = Date.now();
        const totalEndpoints = ELECTRUM_API_ENDPOINTS.length;

        for (let i = 0; i < totalEndpoints; i++) {
            const index = (this.currentEndpointIndex + i) % totalEndpoints;
            const failedAt = this.failedEndpoints.get(index);

            if (!failedAt || now - failedAt > FAILURE_COOLDOWN_MS) {
                // Clear the failure if cooldown has passed
                if (failedAt) this.failedEndpoints.delete(index);
                this.currentEndpointIndex = (index + 1) % totalEndpoints;
                return ELECTRUM_API_ENDPOINTS[index];
            }
        }

        // All endpoints are in cooldown, use the one that failed longest ago
        let oldestFailure = 0;
        let oldestFailureTime = Infinity;
        for (const [index, failedAt] of this.failedEndpoints.entries()) {
            if (failedAt < oldestFailureTime) {
                oldestFailureTime = failedAt;
                oldestFailure = index;
            }
        }
        this.failedEndpoints.delete(oldestFailure);
        this.currentEndpointIndex = (oldestFailure + 1) % totalEndpoints;
        return ELECTRUM_API_ENDPOINTS[oldestFailure];
    }

    /**
     * Marks an endpoint as failed.
     */
    private markEndpointFailed(endpoint: ElectrumApiEndpoint): void {
        const index = ELECTRUM_API_ENDPOINTS.indexOf(endpoint);
        if (index !== -1) {
            this.failedEndpoints.set(index, Date.now());
        }
    }

    /**
     * Fetches address balance from a specific endpoint.
     */
    private async fetchFromEndpoint(endpoint: ElectrumApiEndpoint, address: string): Promise<AddressBalance> {
        const url = endpoint.getAddressUrl(address);

        const response = await fetch(url, {
            headers: {
                Accept: "application/json",
            },
        });

        if (!response.ok) {
            throw new Error(`${endpoint.name} returned ${response.status}: ${response.statusText}`);
        }

        const data: unknown = await response.json();
        const parsed = endpoint.parseResponse(data);

        // Convert satoshis to BTC
        const btc = (parsed.confirmed + parsed.unconfirmed) / 100_000_000;

        return {
            address,
            btc,
            txCount: parsed.txCount,
            lastSeen: new Date().toISOString().slice(0, 10),
        };
    }

    /**
     * Fetches address balance from public Electrum APIs with rotation and fallback.
     */
    private async fetchFromElectrum(address: string): Promise<AddressBalance> {
        const errors: Error[] = [];
        const triedEndpoints = new Set<ElectrumApiEndpoint>();

        // Try up to all endpoints
        for (let attempt = 0; attempt < ELECTRUM_API_ENDPOINTS.length; attempt++) {
            const endpoint = this.getNextEndpoint();
            if (!endpoint || triedEndpoints.has(endpoint)) continue;

            triedEndpoints.add(endpoint);

            try {
                return await this.fetchFromEndpoint(endpoint, address);
            } catch (err) {
                const error = err instanceof Error ? err : new Error(String(err));
                errors.push(new Error(`${endpoint.name}: ${error.message}`));
                this.markEndpointFailed(endpoint);
            }
        }

        // All endpoints failed
        const errorMessages = errors.map((e) => e.message).join("; ");
        throw new Error(`Failed to fetch balance from all endpoints: ${errorMessages}`);
    }

    private mockBalance(address: string): AddressBalance {
        const mock = MOCK_BALANCES[address];
        if (!mock) {
            return { address, btc: 0, txCount: 0, lastSeen: "-" };
        }
        return { address, btc: mock.btc, txCount: mock.txCount, lastSeen: mock.lastSeen };
    }
}
