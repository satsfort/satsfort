import { PortfolioHistoryRequests } from "../requests/PortfolioHistoryRequests";
import type { HistoryPoint } from "./model/HistoryPoint";

export class PortfolioHistoryService {
    private readonly portfolioHistoryRequests = new PortfolioHistoryRequests();

    getAll(): Promise<HistoryPoint[]> {
        return this.portfolioHistoryRequests.getAll();
    }

    async ensureBaseline(): Promise<void> {
        return this.portfolioHistoryRequests.ensureBaseline();
    }

    /**
     * Computes the current total portfolio value as the sum of the latest known
     * balances for all tracked addresses and xpubs, and records a snapshot in
     * the portfolio_value table. Skips writing a snapshot when nothing is tracked
     * so an empty database stays empty rather than accumulating zero-valued rows.
     */
    async snapshot(): Promise<HistoryPoint | null> {
        const tracked = await this.portfolioHistoryRequests.countTracked();

        let btc = 0;
        let usd = 0;
        if (tracked > 0) {
            const totals = await this.portfolioHistoryRequests.sumLatestBalances();
            btc = totals.btc;
            usd = totals.usd;
        } else {
            // No tracked items. Record a zero snapshot if we previously held a
            // non-zero balance (so the chart drops after the last removal), or if
            // the latest zero row is from an earlier day (so the flat-zero stretch
            // still advances on the time axis). Skip same-day zero repeats.
            const latest = await this.portfolioHistoryRequests.selectLatest();
            if (!latest) return null;
            const today = new Date().toISOString().slice(0, 10);
            if (latest.balanceBtc === 0 && latest.fetchedAt.slice(0, 10) === today) return null;
        }

        const fetchedAt = new Date().toISOString();
        await this.portfolioHistoryRequests.insert({ btc, usd, fetchedAt });
        return { date: fetchedAt, btc, usd };
    }

    /**
     * Approximates the BTC balance at `target` by linearly interpolating between
     * the closest snapshots before and after it. Clamps to the nearest endpoint
     * when `target` falls outside the recorded range, and returns 0 for empty
     * history. Assumes `history` is sorted ascending by date.
     */
    valueAt(history: HistoryPoint[], target: Date): number {
        if (history.length === 0) return 0;
        const t = target.getTime();
        const firstT = new Date(history[0].date).getTime();
        if (t <= firstT) return history[0].btc;
        const last = history[history.length - 1];
        const lastT = new Date(last.date).getTime();
        if (t >= lastT) return last.btc;

        let lo = 0;
        let hi = history.length - 1;
        while (hi - lo > 1) {
            const mid = (lo + hi) >>> 1;
            const midT = new Date(history[mid].date).getTime();
            if (midT <= t) lo = mid;
            else hi = mid;
        }

        const a = history[lo];
        const b = history[hi];
        const aT = new Date(a.date).getTime();
        const bT = new Date(b.date).getTime();
        if (bT === aT) return a.btc;
        const ratio = (t - aT) / (bT - aT);
        return a.btc + ratio * (b.btc - a.btc);
    }
}
