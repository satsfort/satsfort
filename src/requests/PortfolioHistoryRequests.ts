import { Config } from "../lib/Config";
import { dbExecute, dbSelect } from "../db";
import { PortfolioValueRecord } from "../services/model/PortfolioValueRecord.ts";
import type { HistoryPoint } from "../services/model/HistoryPoint";

const TARGET_BTC = 2.1;
const WEEKS = 104;
const END_DATE = new Date("2026-04-18T00:00:00Z");
const MOCK_SPOT_USD = 94_820;

type PortfolioValueRow = {
    balance_btc: number;
    balance_usd: number;
    fetched_at: string;
};

export class PortfolioHistoryRequests {
    async getAll(): Promise<HistoryPoint[]> {
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
        if (Config.useMockData) return;

        const [existing] = await dbSelect<{ c: number }>("SELECT COUNT(*) AS c FROM portfolio_value");
        if (existing.c > 0) return;
        await dbExecute("INSERT INTO portfolio_value (uuid, balance_btc, balance_usd, fetched_at) VALUES (?, ?, ?, ?)", [
            crypto.randomUUID(),
            0,
            0,
            new Date().toISOString(),
        ]);
    }

    async countTracked(): Promise<number> {
        const [row] = await dbSelect<{ tracked: number }>(
            "SELECT (SELECT COUNT(*) FROM addresses) + (SELECT COUNT(*) FROM xpubs) AS tracked",
        );
        return row.tracked;
    }

    async sumLatestBalances(): Promise<{ btc: number; usd: number }> {
        const [totals] = await dbSelect<{ total_btc: number | null; total_usd: number | null }>(
            "SELECT COALESCE((SELECT SUM(latest_balance_btc) FROM addresses), 0) + COALESCE((SELECT SUM(latest_balance_btc) FROM xpubs), 0) AS total_btc, COALESCE((SELECT SUM(latest_balance_usd) FROM addresses), 0) + COALESCE((SELECT SUM(latest_balance_usd) FROM xpubs), 0) AS total_usd",
        );
        return { btc: totals.total_btc ?? 0, usd: totals.total_usd ?? 0 };
    }

    async selectLatest(): Promise<PortfolioValueRecord | null> {
        const [row] = await dbSelect<PortfolioValueRow | undefined>(
            "SELECT balance_btc, balance_usd, fetched_at FROM portfolio_value ORDER BY fetched_at DESC LIMIT 1",
        );
        if (!row) return null;
        return { balanceBtc: row.balance_btc, balanceUsd: row.balance_usd, fetchedAt: row.fetched_at };
    }

    async insert(point: { btc: number; usd: number; fetchedAt: string }): Promise<void> {
        if (Config.useMockData) return;

        await dbExecute("INSERT INTO portfolio_value (uuid, balance_btc, balance_usd, fetched_at) VALUES (?, ?, ?, ?)", [
            crypto.randomUUID(),
            point.btc,
            point.usd,
            point.fetchedAt,
        ]);
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
