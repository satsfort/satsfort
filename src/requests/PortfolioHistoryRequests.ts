import { Config } from "../lib/Config";
import { dbExecute, dbSelect } from "../db";

export type HistoryPoint = {
    date: string;
    btc: number;
    usd: number;
};

const TARGET_BTC = 2.1;
const WEEKS = 104;
const END_DATE = new Date("2026-04-18T00:00:00Z");

type PortfolioValueRow = {
    balance_btc: number;
    balance_usd: number;
    fetched_at: string;
};

export class PortfolioHistoryRequests {
    async execute(): Promise<HistoryPoint[]> {
        if (Config.useMockData) return this.buildMock();

        const rows = await dbSelect<PortfolioValueRow>(
            "SELECT balance_btc, balance_usd, fetched_at FROM portfolio_value ORDER BY fetched_at ASC",
        );
        return rows.map((row) => ({ date: row.fetched_at.slice(0, 10), btc: row.balance_btc, usd: row.balance_usd }));
    }

    /**
     * Writes a zero-valued baseline row into portfolio_value when the table is
     * empty. Called on login so the chart has a starting point to compare future
     * additions against. Idempotent — a no-op once any row exists.
     */
    async ensureBaseline(): Promise<void> {
        const [existing] = await dbSelect<{ c: number }>("SELECT COUNT(*) AS c FROM portfolio_value");
        if (existing.c > 0) return;
        await dbExecute("INSERT INTO portfolio_value (uuid, balance_btc, balance_usd, fetched_at) VALUES (?, ?, ?, ?)", [
            crypto.randomUUID(),
            0,
            0,
            new Date().toISOString(),
        ]);
    }

    /**
     * Computes the current total portfolio value as the sum of the latest known
     * balances for all tracked addresses and xpubs, and records a snapshot in
     * the portfolio_value table. Skips writing a snapshot when nothing is tracked
     * so an empty database stays empty rather than accumulating zero-valued rows.
     */
    async snapshot(): Promise<HistoryPoint | null> {
        const [counts] = await dbSelect<{ tracked: number }>(
            "SELECT (SELECT COUNT(*) FROM addresses) + (SELECT COUNT(*) FROM xpubs) AS tracked",
        );

        let btc = 0;
        let usd = 0;
        if (counts.tracked > 0) {
            const [totals] = await dbSelect<{ total_btc: number | null; total_usd: number | null }>(
                "SELECT COALESCE((SELECT SUM(latest_balance_btc) FROM addresses), 0) + COALESCE((SELECT SUM(latest_balance_btc) FROM xpubs), 0) AS total_btc, COALESCE((SELECT SUM(latest_balance_usd) FROM addresses), 0) + COALESCE((SELECT SUM(latest_balance_usd) FROM xpubs), 0) AS total_usd",
            );
            btc = totals.total_btc ?? 0;
            usd = totals.total_usd ?? 0;
        } else {
            // No tracked items. Record a zero snapshot if we previously held a
            // non-zero balance (so the chart drops after the last removal), or if
            // the latest zero row is from an earlier day (so the flat-zero stretch
            // still advances on the time axis). Skip same-day zero repeats.
            const [latest] = await dbSelect<{ balance_btc: number; fetched_at: string } | undefined>(
                "SELECT balance_btc, fetched_at FROM portfolio_value ORDER BY fetched_at DESC LIMIT 1",
            );
            if (!latest) return null;
            const today = new Date().toISOString().slice(0, 10);
            if (latest.balance_btc === 0 && latest.fetched_at.slice(0, 10) === today) return null;
        }

        const fetchedAt = new Date().toISOString();
        await dbExecute("INSERT INTO portfolio_value (uuid, balance_btc, balance_usd, fetched_at) VALUES (?, ?, ?, ?)", [
            crypto.randomUUID(),
            btc,
            usd,
            fetchedAt,
        ]);

        return { date: fetchedAt.slice(0, 10), btc, usd };
    }

    private buildMock(): HistoryPoint[] {
        const raw: { date: string; btc: number }[] = [];
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
        return raw.map((p) => {
            const scaledBtc = Math.round(p.btc * scale * 1e8) / 1e8;
            return {
                date: p.date,
                btc: scaledBtc,
                usd: scaledBtc * MOCK_SPOT_USD,
            };
        });
    }
}

const MOCK_SPOT_USD = 94_820;
