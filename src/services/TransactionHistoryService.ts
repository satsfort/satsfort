import { Config } from "../lib/Config";
import { BlockchainTransactionsRequests, type IngestProgress } from "../requests/BlockchainTransactionsRequests";
import { PortfolioHistoryRequests } from "../requests/PortfolioHistoryRequests";
import { TransactionHistoryRequests } from "../requests/TransactionHistoryRequests";
import type { TransactionRow } from "../requests/TransactionHistoryRequests";
import type { HistoryPoint } from "./model/HistoryPoint";
import type { Transaction } from "./model/Transaction";

export type { IngestProgress };

const SOURCES = ["Coldcard", "Jade", "Strike", "Kraken", "River"];
const SAT_PER_BTC = 100_000_000;

export class TransactionHistoryService {
    private readonly transactionHistoryRequests = new TransactionHistoryRequests();
    private readonly blockchainTransactionsRequests = new BlockchainTransactionsRequests();
    private readonly portfolioHistoryRequests = new PortfolioHistoryRequests();

    constructor(private limit: number = 6) {}

    /**
     * Returns the list of recent transactions for the Portfolio page. In mock
     * mode this is synthesized from the simulated history; in real mode it
     * reads from the persisted `transactions` table populated when addresses
     * and xpubs were added.
     */
    async execute(): Promise<Transaction[]> {
        if (Config.useMockData) {
            const history = await this.portfolioHistoryRequests.getAll();
            return this.buildMock(history);
        }
        const rows = await this.transactionHistoryRequests.listRecent(this.limit);
        return rows.map(this.rowToTransaction);
    }

    /**
     * Returns a page of persisted transactions for a single tracked address,
     * ordered most-recent first.
     */
    async getForAddress(addressUuid: string, limit: number = 25, offset: number = 0): Promise<Transaction[]> {
        if (Config.useMockData) return [];
        const rows = await this.transactionHistoryRequests.listForAddressUuid(addressUuid, limit, offset);
        return rows.map(this.rowToTransaction);
    }

    async countForAddress(addressUuid: string): Promise<number> {
        if (Config.useMockData) return 0;
        return this.transactionHistoryRequests.countForAddressUuid(addressUuid);
    }

    /**
     * Fetches transaction history for a single tracked address and persists
     * it. When `opts.incremental` is true, the blockchain pagination stops
     * as soon as it encounters a txid we already have in the DB — fast for
     * refreshes since older txs don't change.
     */
    async ingestForAddress(
        addressUuid: string,
        address: string,
        opts: { incremental?: boolean; onProgress?: (info: IngestProgress) => void } = {},
    ): Promise<void> {
        if (Config.useMockData) return;

        const internalId = await this.transactionHistoryRequests.findAddressInternalIdByUuid(addressUuid);
        if (internalId === null) return;

        // Incremental mode short-circuits the page loop at the first tx we
        // already have. For a brand-new address with nothing in the DB yet
        // there is no marker, so we naturally fall through to a full fetch.
        let stopAtTxid: string | undefined;
        if (opts.incremental) {
            stopAtTxid = (await this.transactionHistoryRequests.latestConfirmedTxidForAddress(internalId)) ?? undefined;
        }

        // Persistence only happens once the full pagination completes. If we
        // committed each page as we went, a mid-sync failure could advance the
        // `stopAtTxid` marker past txs we never actually saved — the next
        // incremental refresh would skip them forever.
        const transactions = await this.blockchainTransactionsRequests.getForAddress(address, {
            stopAtTxid,
            onPageFetched: ({ pages, txsSoFar }) => {
                opts.onProgress?.({ pages, txsSoFar });
            },
        });
        if (transactions.length > 0) {
            // eslint-disable-next-line no-console
            console.debug(`[tx-ingest] ${address}: persisting ${transactions.length} new transactions`);
            await this.transactionHistoryRequests.upsertMany(
                { kind: "address", addressId: internalId },
                transactions,
            );
            await this.transactionHistoryRequests.markAddressHistoricFetched(internalId);
        }
    }

    /**
     * Fetches and persists transaction history for every address derived
     * from an xpub. Each derived address is queried in parallel; failures
     * for a single address don't abort the whole batch since some derived
     * addresses are commonly empty/unused.
     */
    async ingestForXpub(xpubUuid: string, opts: { incremental?: boolean } = {}): Promise<void> {
        if (Config.useMockData) return;

        const derived = await this.transactionHistoryRequests.findXpubAddressIdsByXpubUuid(xpubUuid);

        await Promise.all(
            derived.map(async (entry) => {
                try {
                    let stopAtTxid: string | undefined;
                    if (opts.incremental) {
                        stopAtTxid =
                            (await this.transactionHistoryRequests.latestConfirmedTxidForXpubAddress(entry.id)) ?? undefined;
                    }
                    // Atomically persist only after the full pagination
                    // completes — same reasoning as ingestForAddress.
                    const transactions = await this.blockchainTransactionsRequests.getForAddress(entry.address, {
                        stopAtTxid,
                    });
                    if (transactions.length > 0) {
                        await this.transactionHistoryRequests.upsertMany(
                            { kind: "xpubAddress", xpubAddressId: entry.id },
                            transactions,
                        );
                        await this.transactionHistoryRequests.markXpubAddressHistoricFetched(entry.id);
                    }
                } catch (err) {
                    console.warn(`Failed to ingest transactions for xpub address ${entry.address}`, err);
                }
            }),
        );
    }

    async deleteForAddress(addressUuid: string): Promise<void> {
        await this.transactionHistoryRequests.deleteForAddressUuid(addressUuid);
    }

    async deleteForXpub(xpubUuid: string): Promise<void> {
        await this.transactionHistoryRequests.deleteForXpubUuid(xpubUuid);
    }

    private rowToTransaction = (row: TransactionRow): Transaction => {
        const isIncoming = row.amount_sat >= 0;
        const date = row.block_time ? new Date(row.block_time * 1000).toISOString().slice(0, 10) : "Pending";
        return {
            id: row.uuid,
            txid: row.txid,
            date,
            type: isIncoming ? "buy" : "sell",
            amount: Math.abs(row.amount_sat) / SAT_PER_BTC,
            source: row.label,
        };
    };

    private buildMock(history: HistoryPoint[]): Transaction[] {
        const out: Transaction[] = [];
        for (let i = history.length - 1; i > 0 && out.length < this.limit; i--) {
            const delta = history[i].btc - history[i - 1].btc;
            if (delta <= 0) continue;
            out.push({
                id: `tx-${i}`,
                txid: null,
                date: history[i].date.slice(0, 10),
                type: delta > 0.04 ? "sell" : "buy",
                amount: Math.round(delta * 1e8) / 1e8,
                source: SOURCES[i % SOURCES.length],
            });
        }
        return out;
    }
}
