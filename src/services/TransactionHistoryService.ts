import { Config } from "../lib/Config";
import { BlockchainTransactionsRequests } from "../requests/BlockchainTransactionsRequests";
import { PortfolioHistoryRequests } from "../requests/PortfolioHistoryRequests";
import { TransactionHistoryRequests } from "../requests/TransactionHistoryRequests";
import type { TransactionRow } from "../requests/TransactionHistoryRequests";
import type { HistoryPoint } from "./model/HistoryPoint";
import type { Transaction } from "./model/Transaction";

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
     * Fetches the full recent transaction history for a single tracked
     * address from a public blockchain API and persists it. Called when a
     * new address is added so the user immediately sees real activity.
     */
    async ingestForAddress(addressUuid: string, address: string): Promise<void> {
        if (Config.useMockData) return;

        const internalId = await this.transactionHistoryRequests.findAddressInternalIdByUuid(addressUuid);
        if (internalId === null) return;

        const transactions = await this.blockchainTransactionsRequests.getForAddress(address);
        await this.transactionHistoryRequests.upsertMany({ kind: "address", addressId: internalId }, transactions);
    }

    /**
     * Fetches and persists transaction history for every address derived
     * from an xpub. Each derived address is queried in parallel; failures
     * for a single address don't abort the whole batch since some derived
     * addresses are commonly empty/unused.
     */
    async ingestForXpub(xpubUuid: string): Promise<void> {
        if (Config.useMockData) return;

        const derived = await this.transactionHistoryRequests.findXpubAddressIdsByXpubUuid(xpubUuid);

        await Promise.all(
            derived.map(async (entry) => {
                try {
                    const transactions = await this.blockchainTransactionsRequests.getForAddress(entry.address);
                    if (transactions.length === 0) return;
                    await this.transactionHistoryRequests.upsertMany({ kind: "xpubAddress", xpubAddressId: entry.id }, transactions);
                } catch (err) {
                    console.warn(`Failed to ingest transactions for xpub address ${entry.address}`, err);
                    throw err;
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
            date,
            type: isIncoming ? "buy" : "transfer",
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
                date: history[i].date,
                type: delta > 0.04 ? "transfer" : "buy",
                amount: Math.round(delta * 1e8) / 1e8,
                source: SOURCES[i % SOURCES.length],
            });
        }
        return out;
    }
}
