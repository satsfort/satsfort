import { Config } from "../lib/Config";
import { dbExecute, dbSelect } from "../db";

export type HistoryPoint = {
    date: string;
    btc: number;
};

const TARGET_BTC = 2.1;
const WEEKS = 104;
const END_DATE = new Date("2026-04-18T00:00:00Z");

type PortfolioValueRow = {
    balance_btc: number;
    fetched_at: string;
};

export class PortfolioHistoryRequests {
    async execute(): Promise<HistoryPoint[]> {
        if (Config.useMockData) return this.buildMock();

        const rows = await dbSelect<PortfolioValueRow>(
            "SELECT balance_btc, fetched_at FROM portfolio_value ORDER BY fetched_at ASC",
        );
        return rows.map((row) => ({ date: row.fetched_at.slice(0, 10), btc: row.balance_btc }));
    }

    /**
     * Computes the current total portfolio value as the sum of the latest known
     * balances for all tracked addresses and xpubs, and records a snapshot in
     * the portfolio_value table.
     */
    async snapshot(): Promise<HistoryPoint> {
        const [totals] = await dbSelect<{ total_btc: number | null }>(
            "SELECT COALESCE((SELECT SUM(latest_balance_btc) FROM addresses), 0) + COALESCE((SELECT SUM(latest_balance_btc) FROM xpubs), 0) AS total_btc",
        );
        const btc = totals.total_btc ?? 0;
        const fetchedAt = new Date().toISOString();

        await dbExecute(
            "INSERT INTO portfolio_value (uuid, balance_btc, fetched_at) VALUES (?, ?, ?)",
            [crypto.randomUUID(), btc, fetchedAt],
        );

        return { date: fetchedAt.slice(0, 10), btc };
    }

    private buildMock(): HistoryPoint[] {
        const raw: HistoryPoint[] = [];
        let btc = 0;

        for (let i = 0; i <= WEEKS; i++) {
            const d = new Date(END_DATE);
            d.setUTCDate(END_DATE.getUTCDate() - (WEEKS - i) * 7);

            if (i > 0) {
                const dca = TARGET_BTC / WEEKS;
                const wobble = (Math.sin(i * 1.73) + Math.cos(i * 0.91)) * 0.006;
                const stack = i % 14 === 0 ? 0.045 : 0;
                btc += Math.max(0, dca + wobble + stack);
            }

            raw.push({ date: d.toISOString().slice(0, 10), btc });
        }

        const scale = TARGET_BTC / raw[raw.length - 1].btc;
        return raw.map((p) => ({
            date: p.date,
            btc: Math.round(p.btc * scale * 1e8) / 1e8,
        }));
    }
}
