import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import type { Database as SqliteDatabase } from "better-sqlite3";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { Config } from "../lib/Config";

const dbRef = vi.hoisted<{ current: SqliteDatabase | null }>(() => ({ current: null }));

vi.mock("@tauri-apps/api/core", () => ({
    invoke: vi.fn(async (command: string, args: { query: string; values?: unknown[] }) => {
        const db = dbRef.current;
        if (!db) throw new Error("Test database is not initialized");
        const values = args.values ?? [];
        if (command === "db_execute") {
            const info = db.prepare(args.query).run(...values);
            return info.changes;
        }
        if (command === "db_select") {
            return db.prepare(args.query).all(...values);
        }
        throw new Error(`Unhandled invoke command: ${command}`);
    }),
}));

vi.mock("@tauri-apps/plugin-http", () => ({
    fetch: vi.fn(),
}));

import { HistoricalPriceRequests } from "./HistoricalPriceRequests";

const migrationsDir = join(process.cwd(), "src-tauri", "migrations");
const migrationSql = readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((f) => readFileSync(join(migrationsDir, f), "utf8"))
    .join("\n");

const ORIGINAL_USE_MOCK = Config.useMockData;

beforeEach(() => {
    const db = new Database(":memory:");
    db.pragma("foreign_keys = ON");
    db.exec(migrationSql);
    dbRef.current = db;
    (Config as { useMockData: boolean }).useMockData = false;
});

afterEach(() => {
    dbRef.current?.close();
    dbRef.current = null;
    (Config as { useMockData: boolean }).useMockData = ORIGINAL_USE_MOCK;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

function fetchOk(body: unknown): Response {
    return {
        ok: true,
        status: 200,
        json: async () => body,
    } as unknown as Response;
}

function fetchFail(status = 500): Response {
    return {
        ok: false,
        status,
        json: async () => ({}),
    } as unknown as Response;
}

function insertHistoricalPrice(date: string, price: number, source: string) {
    dbRef.current!.prepare("INSERT INTO historical_prices (date, price, source) VALUES (?, ?, ?)").run(date, price, source);
}

const historicalPriceRequests = new HistoricalPriceRequests();

describe("HistoricalPriceRequests.getPriceForDate", () => {
    it("returns the cached value from the database without hitting the network", async () => {
        insertHistoricalPrice("2024-06-15", 65_500.5, "coingecko_historical");
        const fetchSpy = vi.fn();
        vi.stubGlobal("fetch", fetchSpy);

        const result = await historicalPriceRequests.getPriceForDate(new Date("2024-06-15T00:00:00Z"));

        expect(result).toEqual({ date: "2024-06-15", price: 65_500.5, source: "coingecko_historical" });
        expect(fetchSpy).not.toHaveBeenCalled();
    });

    it("falls back to the API and persists the result when no DB row exists", async () => {
        const fetchSpy = vi.fn(async (url: string) => {
            if (url.includes("api.coingecko.com")) {
                return fetchOk({ market_data: { current_price: { usd: 42_000 } } });
            }
            throw new Error(`Unexpected URL: ${url}`);
        });
        vi.stubGlobal("fetch", fetchSpy);

        const result = await historicalPriceRequests.getPriceForDate(new Date("2024-06-15T00:00:00Z"));

        expect(result.price).toBe(42_000);
        expect(result.source).toBe("coingecko");
        expect(fetchSpy).toHaveBeenCalledTimes(1);
        const persisted = dbRef.current!.prepare("SELECT date, price, source FROM historical_prices WHERE date = ?").get("2024-06-15") as {
            date: string;
            price: number;
            source: string;
        };
        expect(persisted).toEqual({ date: "2024-06-15", price: 42_000, source: "coingecko" });
    });

    it("uses the format DD-MM-YYYY when calling CoinGecko", async () => {
        const fetchSpy = vi.fn(async () => fetchOk({ market_data: { current_price: { usd: 100 } } }));
        vi.stubGlobal("fetch", fetchSpy);

        await historicalPriceRequests.getPriceForDate(new Date("2024-01-09T12:00:00Z"));

        const firstCall = fetchSpy.mock.calls[0] as unknown[] | undefined;
        const url = firstCall?.[0] as string | undefined;
        expect(url).toBeDefined();
        expect(url).toContain("date=09-01-2024");
    });

    it("falls back to the secondary source when CoinGecko fails", async () => {
        const fetchSpy = vi.fn(async (url: string) => {
            if (url.includes("api.coingecko.com")) return fetchFail(500);
            if (url.includes("cryptocompare.com")) return fetchOk({ BTC: { USD: 30_000 } });
            throw new Error(`Unexpected URL: ${url}`);
        });
        vi.stubGlobal("fetch", fetchSpy);

        const result = await historicalPriceRequests.getPriceForDate(new Date("2024-06-15T00:00:00Z"));

        expect(result.price).toBe(30_000);
        expect(result.source).toBe("cryptocompare");
    });

    it("throws when every source fails", async () => {
        const fetchSpy = vi.fn(async () => fetchFail(503));
        vi.stubGlobal("fetch", fetchSpy);

        await expect(historicalPriceRequests.getPriceForDate(new Date("2024-06-15T00:00:00Z"))).rejects.toThrow(
            /all historical price sources failed/,
        );
    });

    it("keeps at most one row per day, even across multiple lookups", async () => {
        const fetchSpy = vi.fn(async () => fetchOk({ market_data: { current_price: { usd: 50_000 } } }));
        vi.stubGlobal("fetch", fetchSpy);

        await historicalPriceRequests.getPriceForDate(new Date("2024-06-15T00:00:00Z"));
        // Mid-day re-fetch with same UTC date -> upsert, still one row.
        await historicalPriceRequests.getPriceForDate(new Date("2024-06-15T18:30:00Z"));

        const count = dbRef.current!.prepare("SELECT COUNT(*) AS c FROM historical_prices WHERE date = ?").get("2024-06-15") as {
            c: number;
        };
        expect(count.c).toBe(1);
    });

    it("rejects an API response with no usable price and tries the next source", async () => {
        const fetchSpy = vi.fn(async (url: string) => {
            if (url.includes("api.coingecko.com")) return fetchOk({ market_data: {} });
            if (url.includes("cryptocompare.com")) return fetchOk({ BTC: { USD: 27_000 } });
            throw new Error(`Unexpected URL: ${url}`);
        });
        vi.stubGlobal("fetch", fetchSpy);

        const result = await historicalPriceRequests.getPriceForDate(new Date("2024-06-15T00:00:00Z"));
        expect(result.source).toBe("cryptocompare");
        expect(result.price).toBe(27_000);
    });
});

describe("HistoricalPriceRequests.ensureSeeded", () => {
    it("populates historical_prices from the bundled CSV when the table is empty", async () => {
        await historicalPriceRequests.ensureSeeded();

        const count = dbRef.current!.prepare("SELECT COUNT(*) AS c FROM historical_prices").get() as { c: number };
        expect(count.c).toBeGreaterThan(1_000);

        const sample = dbRef.current!.prepare("SELECT date, price, source FROM historical_prices WHERE date = ?").get("2013-04-28") as
            | { date: string; price: number; source: string }
            | undefined;
        expect(sample).toBeDefined();
        expect(sample!.source).toBe("coingecko_historical");
        expect(sample!.price).toBeGreaterThan(0);
    });

    it("is idempotent — a second call does not duplicate or grow the table", async () => {
        await historicalPriceRequests.ensureSeeded();
        const firstCount = (dbRef.current!.prepare("SELECT COUNT(*) AS c FROM historical_prices").get() as { c: number }).c;

        await historicalPriceRequests.ensureSeeded();
        const secondCount = (dbRef.current!.prepare("SELECT COUNT(*) AS c FROM historical_prices").get() as { c: number }).c;

        expect(secondCount).toBe(firstCount);
    });

    it("skips seeding when the table already has any row", async () => {
        insertHistoricalPrice("2099-01-01", 1, "manual");
        await historicalPriceRequests.ensureSeeded();
        const rows = dbRef.current!.prepare("SELECT date, source FROM historical_prices").all() as { date: string; source: string }[];
        expect(rows).toHaveLength(1);
        expect(rows[0]).toEqual({ date: "2099-01-01", source: "manual" });
    });
});
