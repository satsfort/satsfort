import type { RawTransaction } from "../services/model/RawTransaction";

const MAX_PAGES_PER_ADDRESS = 5;

type MempoolTxStatus = {
    confirmed: boolean;
    block_time?: number;
};

type MempoolVin = {
    prevout?: {
        scriptpubkey_address?: string;
        value: number;
    };
};

type MempoolVout = {
    scriptpubkey_address?: string;
    value: number;
};

type MempoolTx = {
    txid: string;
    status: MempoolTxStatus;
    vin: MempoolVin[];
    vout: MempoolVout[];
};

type Endpoint = {
    name: string;
    firstPageUrl: (address: string) => string;
    nextPageUrl: (address: string, lastSeenTxid: string) => string;
};

const ENDPOINTS: Endpoint[] = [
    {
        name: "mempool.space",
        firstPageUrl: (address) => `https://mempool.space/api/address/${address}/txs`,
        nextPageUrl: (address, lastSeenTxid) => `https://mempool.space/api/address/${address}/txs/chain/${lastSeenTxid}`,
    },
    {
        name: "blockstream.info",
        firstPageUrl: (address) => `https://blockstream.info/api/address/${address}/txs`,
        nextPageUrl: (address, lastSeenTxid) => `https://blockstream.info/api/address/${address}/txs/chain/${lastSeenTxid}`,
    },
];

function netAmountForAddress(tx: MempoolTx, address: string): number {
    let received = 0;
    let spent = 0;
    for (const vout of tx.vout) {
        if (vout.scriptpubkey_address === address) received += vout.value;
    }
    for (const vin of tx.vin) {
        const prev = vin.prevout;
        if (prev && prev.scriptpubkey_address === address) spent += prev.value;
    }
    return received - spent;
}

async function fetchPage(url: string): Promise<MempoolTx[]> {
    const response = await fetch(url, { headers: { Accept: "application/json" } });
    if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    return (await response.json()) as MempoolTx[];
}

async function fetchAllFrom(endpoint: Endpoint, address: string): Promise<MempoolTx[]> {
    const collected: MempoolTx[] = [];
    let nextUrl = endpoint.firstPageUrl(address);

    for (let page = 0; page < MAX_PAGES_PER_ADDRESS; page++) {
        const batch = await fetchPage(nextUrl);
        if (batch.length === 0) break;
        collected.push(...batch);

        const lastConfirmed = [...batch].reverse().find((tx) => tx.status.confirmed);
        if (!lastConfirmed) break;
        nextUrl = endpoint.nextPageUrl(address, lastConfirmed.txid);
    }

    return collected;
}

export class BlockchainTransactionsRequests {
    /**
     * Fetches the recent transaction history for an address from a public
     * Electrum-compatible HTTP API, falling back to a secondary source on
     * failure. Each tx is reduced to its net effect on the queried address
     * so callers don't have to reconcile vins/vouts themselves.
     *
     * Pagination is capped at MAX_PAGES_PER_ADDRESS (~250 txs) to keep the
     * add-address flow bounded; further history can be backfilled later.
     */
    async getForAddress(address: string): Promise<RawTransaction[]> {
        const errors: string[] = [];

        for (const endpoint of ENDPOINTS) {
            try {
                const txs = await fetchAllFrom(endpoint, address);
                return txs.map((tx) => ({
                    txid: tx.txid,
                    amountSat: netAmountForAddress(tx, address),
                    blockTime: tx.status.block_time ?? null,
                    confirmed: tx.status.confirmed,
                }));
            } catch (err) {
                const message = err instanceof Error ? err.message : String(err);
                errors.push(`${endpoint.name}: ${message}`);
                console.warn(`BlockchainTransactionsRequests: ${endpoint.name} failed for ${address}`, err);
            }
        }

        throw new Error(`Failed to fetch transactions for ${address}: ${errors.join("; ")}`);
    }
}
