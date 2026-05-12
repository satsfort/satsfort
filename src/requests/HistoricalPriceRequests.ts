import csvText from "../assets/btc-usd-max.csv?raw";
import { Config } from "../lib/Config";
import { httpFetch } from "../lib/httpFetch";
import { dbExecute, dbSelect } from "../db";
import type { HistoricalPrice } from "../services/model/HistoricalPrice";

const CSV_SOURCE = "coingecko_historical";
const SEED_CHUNK_SIZE = 300;

type HistoricalFetcher = {
    name: string;
    fetch: (date: Date) => Promise<number>;
};

const HISTORICAL_SOURCES: HistoricalFetcher[] = [
    {
        name: "coingecko",
        fetch: async (date) => {
            const day = String(date.getUTCDate()).padStart(2, "0");
            const month = String(date.getUTCMonth() + 1).padStart(2, "0");
            const year = date.getUTCFullYear();
            const res = await httpFetch(
                `https://api.coingecko.com/api/v3/coins/bitcoin/history?date=${day}-${month}-${year}&localization=false`,
            );
            if (!res.ok) throw new Error(`CoinGecko HTTP ${res.status}`);
            const data = await res.json();
            const usd = data?.market_data?.current_price?.usd;
            if (typeof usd !== "number" || !Number.isFinite(usd) || usd <= 0) {
                throw new Error("CoinGecko returned no usable price");
            }
            return usd;
        },
    },
    {
        name: "cryptocompare",
        fetch: async (date) => {
            const ts = Math.floor(date.getTime() / 1000);
            const res = await httpFetch(`https://min-api.cryptocompare.com/data/pricehistorical?fsym=BTC&tsyms=USD&ts=${ts}`);
            if (!res.ok) throw new Error(`CryptoCompare HTTP ${res.status}`);
            const data = await res.json();
            const usd = data?.BTC?.USD;
            if (typeof usd !== "number" || !Number.isFinite(usd) || usd <= 0) {
                throw new Error("CryptoCompare returned no usable price");
            }
            return usd;
        },
    },
];

function toIsoDate(date: Date): string {
    return date.toISOString().slice(0, 10);
}

function parseSeedRows(csv: string): { date: string; price: number }[] {
    const rows: { date: string; price: number }[] = [];
    const lines = csv.split(/\r?\n/);
    // Skip header row (index 0).
    for (let i = 1; i < lines.length; i++) {
        const line = lines[i];
        if (!line) continue;
        const [snappedAt, priceStr] = line.split(",");
        if (!snappedAt || !priceStr) continue;
        const date = snappedAt.slice(0, 10);
        const price = parseFloat(priceStr);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(price) || price <= 0) continue;
        rows.push({ date, price });
    }
    return rows;
}

export class HistoricalPriceRequests {
    /**
     * Returns the BTC price (USD) for the given date. Prefers a previously
     * stored row in `historical_prices`; otherwise fetches from one of the
     * remote sources and persists the result so subsequent calls hit the DB.
     * The table holds at most one row per UTC day.
     */
    async getPriceForDate(date: Date): Promise<HistoricalPrice> {
        const isoDate = toIsoDate(date);

        if (!Config.useMockData) {
            const [row] = await dbSelect<{ date: string; price: number; source: string }>(
                "SELECT date, price, source FROM historical_prices WHERE date = ? LIMIT 1",
                [isoDate],
            );
            if (row) return { date: row.date, price: row.price, source: row.source };
        }

        let lastError: unknown = null;
        for (const source of HISTORICAL_SOURCES) {
            try {
                const price = await source.fetch(date);
                if (!Config.useMockData) {
                    await dbExecute(
                        "INSERT INTO historical_prices (date, price, source) VALUES (?, ?, ?) ON CONFLICT(date) DO UPDATE SET price = excluded.price, source = excluded.source, fetched_at = datetime('now')",
                        [isoDate, price, source.name],
                    );
                }
                return { date: isoDate, price, source: source.name };
            } catch (error) {
                lastError = error;
                console.warn(`HistoricalPriceRequests: ${source.name} failed, trying next`, error);
            }
        }

        const detail = lastError instanceof Error ? lastError.message : String(lastError ?? "");
        const suffix = detail ? ` (last error: ${detail})` : "";
        throw new Error(`HistoricalPriceRequests: all historical price sources failed for ${isoDate}${suffix}`);
    }

    /**
     * Bulk-loads the bundled CoinGecko CSV into `historical_prices` the first
     * time the table is empty. Idempotent — once any row exists, the call is
     * a no-op so we don't repeatedly re-parse the CSV on every launch.
     */
    async ensureSeeded(): Promise<void> {
        if (Config.useMockData) return;

        const [existing] = await dbSelect<{ c: number }>("SELECT COUNT(*) AS c FROM historical_prices");
        if (existing.c > 0) return;

        const rows = parseSeedRows(csvText);
        if (rows.length === 0) return;

        for (let i = 0; i < rows.length; i += SEED_CHUNK_SIZE) {
            const chunk = rows.slice(i, i + SEED_CHUNK_SIZE);
            const placeholders = chunk.map(() => "(?, ?, ?)").join(",");
            const params = chunk.flatMap((r) => [r.date, r.price, CSV_SOURCE]);
            await dbExecute(`INSERT OR IGNORE INTO historical_prices (date, price, source) VALUES ${placeholders}`, params);
        }
    }
}
