import { Config } from "../lib/Config";
import { BacktrackRequests } from "../requests/BacktrackRequests";
import type { ConfirmedTxRow } from "../requests/BacktrackRequests";
import { HistoricalPriceRequests } from "../requests/HistoricalPriceRequests";
import type { DailyBalanceSnapshot } from "./model/DailyBalanceSnapshot";

const SAT_PER_BTC = 100_000_000;

type BacktrackOptions = { skipPortfolioRebuild?: boolean };
type BalanceSnapshot = { ownerId: number; balanceBtc: number; fetchedAt: string };

/**
 * Recomputes historical balance snapshots from the persisted transaction
 * tables and rebuilds `portfolio_value` from them. Called after a new address
 * or xpub finishes its initial transaction backfill so the chart picks up
 * history reaching back to the address's first incoming transaction.
 */
export class BacktrackService {
    private readonly backtrackRequests = new BacktrackRequests();
    private readonly historicalPriceRequests = new HistoricalPriceRequests();

    async backtrackAddress(addressUuid: string, opts: BacktrackOptions = {}): Promise<void> {
        if (Config.useMockData) return;

        const internalId = await this.backtrackRequests.findAddressInternalIdByUuid(addressUuid);
        if (internalId === null) return;

        const txs = await this.backtrackRequests.getConfirmedTransactionsForAddress(internalId);
        const snapshots = await this.computeDailySnapshots(txs);
        await this.backtrackRequests.replaceAddressHistoricalBalances(internalId, snapshots);

        if (!opts.skipPortfolioRebuild) await this.rebuildPortfolioValues();
    }

    async backtrackXpub(xpubUuid: string, opts: BacktrackOptions = {}): Promise<void> {
        if (Config.useMockData) return;

        const internalId = await this.backtrackRequests.findXpubInternalIdByUuid(xpubUuid);
        if (internalId === null) return;

        const derived = await this.backtrackRequests.getDerivedAddressesForXpub(internalId);

        // Backfill each derived address. Snapshots are returned so we can
        // aggregate them into xpub-level rows without re-querying.
        const derivedSnapshots: { addressId: number; snapshots: DailyBalanceSnapshot[] }[] = [];
        for (const d of derived) {
            const txs = await this.backtrackRequests.getConfirmedTransactionsForXpubAddress(d.id);
            const snapshots = await this.computeDailySnapshots(txs);
            await this.backtrackRequests.replaceXpubAddressHistoricalBalances(d.id, snapshots);
            derivedSnapshots.push({ addressId: d.id, snapshots });
        }

        const xpubSnapshots = await this.aggregateXpubSnapshots(derivedSnapshots);
        await this.backtrackRequests.replaceXpubHistoricalBalances(internalId, xpubSnapshots);

        if (!opts.skipPortfolioRebuild) await this.rebuildPortfolioValues();
    }

    /**
     * Wipes `portfolio_value` and reinserts one row per UTC day on which any
     * tracked entity had a balance change. Daily total = sum of latest
     * `balance_btc` ≤ that day across every address and every xpub.
     */
    async rebuildPortfolioValues(): Promise<void> {
        if (Config.useMockData) return;

        const addressSnaps = await this.backtrackRequests.getAllAddressBalanceSnapshots();
        const xpubSnaps = await this.backtrackRequests.getAllXpubBalanceSnapshots();

        if (addressSnaps.length === 0 && xpubSnaps.length === 0) {
            await this.backtrackRequests.wipePortfolioValues();
            return;
        }

        const byAddress = new Map<number, BalanceSnapshot[]>();
        for (const s of addressSnaps) {
            const list = byAddress.get(s.address_id) ?? [];
            list.push({ ownerId: s.address_id, balanceBtc: s.balance_btc, fetchedAt: s.fetched_at });
            byAddress.set(s.address_id, list);
        }
        const byXpub = new Map<number, BalanceSnapshot[]>();
        for (const s of xpubSnaps) {
            const list = byXpub.get(s.xpub_id) ?? [];
            list.push({ ownerId: s.xpub_id, balanceBtc: s.balance_btc, fetchedAt: s.fetched_at });
            byXpub.set(s.xpub_id, list);
        }

        const allDates = new Set<string>();
        for (const s of addressSnaps) allDates.add(s.fetched_at.slice(0, 10));
        for (const s of xpubSnaps) allDates.add(s.fetched_at.slice(0, 10));

        const sortedDates = [...allDates].sort();
        const prices = await this.fetchPricesForDates(sortedDates);

        const portfolioRows: { btc: number; usd: number; fetchedAt: string }[] = [];
        for (const date of sortedDates) {
            let totalBtc = 0;
            for (const list of byAddress.values()) totalBtc += latestBalanceOnOrBeforeDate(list, date);
            for (const list of byXpub.values()) totalBtc += latestBalanceOnOrBeforeDate(list, date);
            const price = prices.get(date) ?? 0;
            portfolioRows.push({
                btc: totalBtc,
                usd: totalBtc * price,
                fetchedAt: `${date}T23:59:59Z`,
            });
        }

        await this.backtrackRequests.wipePortfolioValues();
        await this.backtrackRequests.insertPortfolioValueSnapshots(portfolioRows);
    }

    /**
     * Reduces a list of confirmed transactions to one snapshot per UTC day
     * where a tx occurred. The cumulative balance running through txs is what
     * makes each snapshot the address's end-of-day balance, not the per-tx
     * delta.
     */
    private async computeDailySnapshots(txs: ConfirmedTxRow[]): Promise<DailyBalanceSnapshot[]> {
        if (txs.length === 0) return [];

        const byDate = new Map<string, { delta: number; count: number }>();
        for (const tx of txs) {
            const date = isoDateFromUnix(tx.block_time);
            const e = byDate.get(date) ?? { delta: 0, count: 0 };
            e.delta += tx.amount_sat;
            e.count += 1;
            byDate.set(date, e);
        }
        const sortedDates = [...byDate.keys()].sort();
        const prices = await this.fetchPricesForDates(sortedDates);

        const snapshots: DailyBalanceSnapshot[] = [];
        let runningSat = 0;
        let runningTx = 0;
        for (const date of sortedDates) {
            const e = byDate.get(date)!;
            runningSat += e.delta;
            runningTx += e.count;
            const balanceBtc = runningSat / SAT_PER_BTC;
            const price = prices.get(date) ?? 0;
            snapshots.push({
                date,
                balanceBtc,
                balanceUsd: balanceBtc * price,
                txCount: runningTx,
                fetchedAt: `${date}T23:59:59Z`,
            });
        }
        return snapshots;
    }

    /**
     * Sums per-derived-address daily snapshots into xpub-level daily rows.
     * For each date any derived address had activity, walks each derived
     * series to find its latest balance ≤ that day and sums them.
     */
    private async aggregateXpubSnapshots(
        derivedSnapshots: { addressId: number; snapshots: DailyBalanceSnapshot[] }[],
    ): Promise<DailyBalanceSnapshot[]> {
        const allDates = new Set<string>();
        for (const entry of derivedSnapshots) {
            for (const s of entry.snapshots) allDates.add(s.date);
        }
        if (allDates.size === 0) return [];

        const sortedDates = [...allDates].sort();
        const prices = await this.fetchPricesForDates(sortedDates);

        const result: DailyBalanceSnapshot[] = [];
        for (const date of sortedDates) {
            let totalBtc = 0;
            let totalTx = 0;
            for (const entry of derivedSnapshots) {
                const latest = latestSnapshotOnOrBefore(entry.snapshots, date);
                if (latest) {
                    totalBtc += latest.balanceBtc;
                    totalTx += latest.txCount;
                }
            }
            const price = prices.get(date) ?? 0;
            result.push({
                date,
                balanceBtc: totalBtc,
                balanceUsd: totalBtc * price,
                txCount: totalTx,
                fetchedAt: `${date}T23:59:59Z`,
            });
        }
        return result;
    }

    /**
     * Looks up USD prices for the supplied UTC dates, hitting the bulk DB
     * cache first and falling back to the per-date fetcher (which itself
     * persists to `historical_prices`) for any misses. Sequential fallback
     * keeps us under remote rate limits.
     */
    private async fetchPricesForDates(dates: string[]): Promise<Map<string, number>> {
        if (dates.length === 0) return new Map();
        const cached = await this.backtrackRequests.getPricesForDates(dates);
        for (const date of dates) {
            if (cached.has(date)) continue;
            try {
                const result = await this.historicalPriceRequests.getPriceForDate(new Date(`${date}T12:00:00Z`));
                cached.set(date, result.price);
            } catch (err) {
                console.warn(`BacktrackService: failed to fetch price for ${date}`, err);
            }
        }
        return cached;
    }
}

function isoDateFromUnix(seconds: number): string {
    return new Date(seconds * 1000).toISOString().slice(0, 10);
}

function latestBalanceOnOrBeforeDate(snaps: BalanceSnapshot[], date: string): number {
    // Compare on the YYYY-MM-DD prefix so a snapshot fetched at any time on
    // the cutoff day counts. String-comparing the full ISO would fall over
    // on `T23:59:59Z` vs `T23:59:59.000Z` ordering.
    let latest = 0;
    for (const s of snaps) {
        if (s.fetchedAt.slice(0, 10) <= date) latest = s.balanceBtc;
        else break;
    }
    return latest;
}

function latestSnapshotOnOrBefore(snaps: DailyBalanceSnapshot[], date: string): DailyBalanceSnapshot | null {
    let latest: DailyBalanceSnapshot | null = null;
    for (const s of snaps) {
        if (s.date <= date) latest = s;
        else break;
    }
    return latest;
}
