import type { RawTransaction } from "../services/model/RawTransaction";

// Mempool.space / blockstream.info return 25 confirmed txs per chain page.
// 500 pages = up to ~12,500 txs per address, which covers all but pathologically
// active addresses (exchange hot wallets, etc.). The inter-page delay below keeps
// us under the public-API rate limits.
const MAX_PAGES_PER_ADDRESS = 500;
const INTER_PAGE_DELAY_MS = 250;

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

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

export type IngestProgress = { pages: number; txsSoFar: number };
export type PageFetched = IngestProgress & { pageTxs: RawTransaction[] };

async function fetchAllFrom(
    endpoint: Endpoint,
    address: string,
    stopAtTxid: string | undefined,
    onPageFetched: ((info: PageFetched) => Promise<void> | void) | undefined,
): Promise<RawTransaction[]> {
    const collected: RawTransaction[] = [];
    let nextUrl = endpoint.firstPageUrl(address);

    for (let page = 0; page < MAX_PAGES_PER_ADDRESS; page++) {
        if (page > 0) await sleep(INTER_PAGE_DELAY_MS);
        const batch = await fetchPage(nextUrl);
        if (batch.length === 0) {
            // eslint-disable-next-line no-console
            console.debug(`[tx-ingest] ${address} page ${page + 1}: empty, done (total ${collected.length})`);
            break;
        }

        // Pages are returned newest-first; once we hit our stop marker every
        // older tx is also already in the DB.
        let stopEarly = false;
        let toAdd = batch;
        if (stopAtTxid) {
            const knownIdx = batch.findIndex((tx) => tx.txid === stopAtTxid);
            if (knownIdx !== -1) {
                toAdd = batch.slice(0, knownIdx);
                stopEarly = true;
            }
        }
        const pageTxs: RawTransaction[] = toAdd.map((tx) => ({
            txid: tx.txid,
            amountSat: netAmountForAddress(tx, address),
            blockTime: tx.status.block_time ?? null,
            confirmed: tx.status.confirmed,
        }));
        collected.push(...pageTxs);

        const stopNote = stopEarly ? " (hit known tx, stopping)" : "";
        // eslint-disable-next-line no-console
        console.debug(`[tx-ingest] ${address} page ${page + 1}: +${pageTxs.length} new (total ${collected.length})${stopNote}`);
        if (onPageFetched) await onPageFetched({ pages: page + 1, txsSoFar: collected.length, pageTxs });

        if (stopEarly) break;

        const lastConfirmed = [...batch].reverse().find((tx) => tx.status.confirmed);
        if (!lastConfirmed) break;
        nextUrl = endpoint.nextPageUrl(address, lastConfirmed.txid);
    }

    return collected;
}

export class BlockchainTransactionsRequests {
    /**
     * Fetches the transaction history for an address from a public
     * Electrum-compatible HTTP API, falling back to a secondary source on
     * failure. Each tx is reduced to its net effect on the queried address
     * so callers don't have to reconcile vins/vouts themselves.
     *
     * If `stopAtTxid` is provided, pagination stops as soon as that txid is
     * encountered (incremental refresh — every older tx is already in the
     * DB). Pass nothing for a full backfill.
     */
    async getForAddress(
        address: string,
        opts: { stopAtTxid?: string; onPageFetched?: (info: PageFetched) => Promise<void> | void } = {},
    ): Promise<RawTransaction[]> {
        const errors: string[] = [];
        const mode = opts.stopAtTxid ? `incremental (stop at ${opts.stopAtTxid.slice(0, 12)}…)` : "full";
        // eslint-disable-next-line no-console
        console.debug(`[tx-ingest] ${address}: starting fetch, ${mode}`);

        for (const endpoint of ENDPOINTS) {
            try {
                const txs = await fetchAllFrom(endpoint, address, opts.stopAtTxid, opts.onPageFetched);
                // eslint-disable-next-line no-console
                console.debug(`[tx-ingest] ${address}: fetched ${txs.length} txs from ${endpoint.name}`);
                return txs;
            } catch (err) {
                const message = err instanceof Error ? err.message : String(err);
                errors.push(`${endpoint.name}: ${message}`);
                console.warn(`BlockchainTransactionsRequests: ${endpoint.name} failed for ${address}`, err);
            }
        }

        throw new Error(`Failed to fetch transactions for ${address}: ${errors.join("; ")}`);
    }
}
