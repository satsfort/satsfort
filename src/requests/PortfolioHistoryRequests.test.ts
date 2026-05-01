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

import { PortfolioHistoryRequests } from "./PortfolioHistoryRequests";

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
});

function insertAddress(address: string, label: string, balanceBtc: number | null, balanceUsd: number | null = null) {
    const db = dbRef.current!;
    db.prepare(
        "INSERT INTO addresses (uuid, label, address, address_type, latest_balance_btc, latest_balance_usd) VALUES (?, ?, ?, ?, ?, ?)",
    ).run(crypto.randomUUID(), label, address, "P2WPKH", balanceBtc, balanceUsd);
}

function insertXpub(label: string, xpubKey: string, balanceBtc: number | null, balanceUsd: number | null = null) {
    const db = dbRef.current!;
    db.prepare(
        "INSERT INTO xpubs (uuid, label, xpub, derivation_type, address_count, latest_balance_btc, latest_balance_usd) VALUES (?, ?, ?, ?, ?, ?, ?)",
    ).run(crypto.randomUUID(), label, xpubKey, "P2WPKH", 20, balanceBtc, balanceUsd);
}

function insertPortfolioValue(balanceBtc: number, balanceUsd: number, fetchedAt: string) {
    dbRef
        .current!.prepare("INSERT INTO portfolio_value (uuid, balance_btc, balance_usd, fetched_at) VALUES (?, ?, ?, ?)")
        .run(crypto.randomUUID(), balanceBtc, balanceUsd, fetchedAt);
}

const portfolioHistoryRequests = new PortfolioHistoryRequests();

describe("PortfolioHistoryRequests.ensureBaseline", () => {
    it("inserts a zero-valued row when portfolio_value is empty", async () => {
        await portfolioHistoryRequests.ensureBaseline();

        const rows = dbRef.current!.prepare("SELECT balance_btc, balance_usd FROM portfolio_value").all() as {
            balance_btc: number;
            balance_usd: number;
        }[];
        expect(rows).toHaveLength(1);
        expect(rows[0].balance_btc).toBe(0);
        expect(rows[0].balance_usd).toBe(0);
    });

    it("is a no-op when a row already exists", async () => {
        insertPortfolioValue(0.5, 50_000, "2026-04-23T12:00:00.000Z");

        await portfolioHistoryRequests.ensureBaseline();

        const count = dbRef.current!.prepare("SELECT COUNT(*) AS c FROM portfolio_value").get() as { c: number };
        expect(count.c).toBe(1);
    });
});

describe("PortfolioHistoryRequests.countTracked", () => {
    it("returns the combined count of addresses and xpubs", async () => {
        insertAddress("bc1qaddr1", "Addr 1", 0.1);
        insertAddress("bc1qaddr2", "Addr 2", 0.2);
        insertXpub("Xpub A", "zpub-a", 0.5);

        expect(await portfolioHistoryRequests.countTracked()).toBe(3);
    });

    it("returns zero when neither table has rows", async () => {
        expect(await portfolioHistoryRequests.countTracked()).toBe(0);
    });
});

describe("PortfolioHistoryRequests.sumLatestBalances", () => {
    it("sums balances across addresses and xpubs, treating nulls as zero", async () => {
        insertAddress("bc1qaddr1", "Addr 1", 0.5, 50_000);
        insertAddress("bc1qaddr2", "Unseen", null, null);
        insertXpub("Xpub A", "zpub-a", 0.25, 25_000);

        const totals = await portfolioHistoryRequests.sumLatestBalances();
        expect(totals.btc).toBeCloseTo(0.75, 8);
        expect(totals.usd).toBeCloseTo(75_000, 4);
    });
});

describe("PortfolioHistoryRequests.selectLatest", () => {
    it("returns null when portfolio_value is empty", async () => {
        expect(await portfolioHistoryRequests.selectLatest()).toBeNull();
    });

    it("returns the most recent row by fetched_at", async () => {
        insertPortfolioValue(0.1, 10_000, "2026-01-01T12:00:00.000Z");
        insertPortfolioValue(0.3, 30_000, "2026-03-01T12:00:00.000Z");
        insertPortfolioValue(0.2, 20_000, "2026-02-01T12:00:00.000Z");

        const latest = await portfolioHistoryRequests.selectLatest();
        expect(latest).not.toBeNull();
        expect(latest!.balanceBtc).toBeCloseTo(0.3, 8);
        expect(latest!.balanceUsd).toBeCloseTo(30_000, 4);
        expect(latest!.fetchedAt).toBe("2026-03-01T12:00:00.000Z");
    });
});

describe("PortfolioHistoryRequests.insert", () => {
    it("writes a new portfolio_value row with the provided fields", async () => {
        await portfolioHistoryRequests.insert({ btc: 0.4, usd: 40_000, fetchedAt: "2026-04-20T08:00:00.000Z" });

        const row = dbRef.current!.prepare("SELECT balance_btc, balance_usd, fetched_at FROM portfolio_value").get() as {
            balance_btc: number;
            balance_usd: number;
            fetched_at: string;
        };
        expect(row.balance_btc).toBeCloseTo(0.4, 8);
        expect(row.balance_usd).toBeCloseTo(40_000, 4);
        expect(row.fetched_at).toBe("2026-04-20T08:00:00.000Z");
    });
});

describe("PortfolioHistoryRequests.execute", () => {
    it("returns the portfolio_value rows when mock is disabled", async () => {
        insertPortfolioValue(0.5, 50_000, "2026-04-23T12:00:00.000Z");

        const history = await portfolioHistoryRequests.getAll();
        expect(history).toHaveLength(1);
        expect(history[0].btc).toBeCloseTo(0.5, 8);
        expect(history[0].usd).toBeCloseTo(50_000, 4);
        // Now keeps the full ISO timestamp so multiple same-day snapshots
        // get distinct x positions on the chart.
        expect(history[0].date).toBe("2026-04-23T12:00:00.000Z");
    });

    it("returns rows sorted by fetched_at ascending", async () => {
        insertPortfolioValue(0.3, 30_000, "2026-03-01T12:00:00.000Z");
        insertPortfolioValue(0.1, 10_000, "2026-01-01T12:00:00.000Z");
        insertPortfolioValue(0.2, 20_000, "2026-02-01T12:00:00.000Z");

        const history = await portfolioHistoryRequests.getAll();
        expect(history.map((p) => p.btc)).toEqual([0.1, 0.2, 0.3]);
        expect(history.map((p) => p.usd)).toEqual([10_000, 20_000, 30_000]);
    });

    it("returns the mock history when mock is enabled", async () => {
        (Config as { useMockData: boolean }).useMockData = true;
        const history = await portfolioHistoryRequests.getAll();
        expect(history.length).toBeGreaterThan(0);
    });
});
