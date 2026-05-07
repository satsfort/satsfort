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

import { PortfolioHistoryService } from "./PortfolioHistoryService";

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
    vi.useRealTimers();
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

const portfolioHistoryService = new PortfolioHistoryService();

describe("PortfolioHistoryService.snapshot", () => {
    it("skips writing a snapshot when nothing is tracked and the table is empty", async () => {
        const point = await portfolioHistoryService.snapshot();
        expect(point).toBeNull();

        const count = dbRef.current!.prepare("SELECT COUNT(*) AS c FROM portfolio_value").get() as { c: number };
        expect(count.c).toBe(0);
    });

    it("sums latest_balance_btc and latest_balance_usd across addresses and xpubs", async () => {
        insertAddress("bc1qaddr1", "Addr 1", 0.5, 50_000);
        insertAddress("bc1qaddr2", "Addr 2", 0.25, 25_000);
        insertXpub("Xpub A", "zpub-a", 1.0, 100_000);
        insertXpub("Xpub B", "zpub-b", 0.125, 12_500);

        const point = await portfolioHistoryService.snapshot();
        expect(point).not.toBeNull();
        expect(point!.btc).toBeCloseTo(1.875, 8);
        expect(point!.usd).toBeCloseTo(187_500, 4);

        const row = dbRef.current!.prepare("SELECT balance_btc, balance_usd FROM portfolio_value").get() as {
            balance_btc: number;
            balance_usd: number;
        };
        expect(row.balance_btc).toBeCloseTo(1.875, 8);
        expect(row.balance_usd).toBeCloseTo(187_500, 4);
    });

    it("treats null latest balances as zero", async () => {
        insertAddress("bc1qaddr1", "Addr 1", 0.5, 50_000);
        insertAddress("bc1qaddr2", "Unseen addr", null, null);
        insertXpub("Unseen xpub", "zpub-unseen", null, null);
        insertXpub("Xpub B", "zpub-b", 0.25, 25_000);

        const point = await portfolioHistoryService.snapshot();
        expect(point).not.toBeNull();
        expect(point!.btc).toBeCloseTo(0.75, 8);
        expect(point!.usd).toBeCloseTo(75_000, 4);
    });

    it("appends a new row on each invocation when items are tracked", async () => {
        insertAddress("bc1qaddr1", "Addr 1", 0.1);

        await portfolioHistoryService.snapshot();
        await portfolioHistoryService.snapshot();
        await portfolioHistoryService.snapshot();

        const count = dbRef.current!.prepare("SELECT COUNT(*) AS c FROM portfolio_value").get() as { c: number };
        expect(count.c).toBe(3);
    });

    it("writes a zero row when nothing is tracked but the latest row is non-zero", async () => {
        insertPortfolioValue(0.5, 50_000, "2026-04-23T12:00:00.000Z");

        const point = await portfolioHistoryService.snapshot();
        expect(point).not.toBeNull();
        expect(point!.btc).toBe(0);
        expect(point!.usd).toBe(0);

        const count = dbRef.current!.prepare("SELECT COUNT(*) AS c FROM portfolio_value").get() as { c: number };
        expect(count.c).toBe(2);
    });

    it("skips the zero row when nothing is tracked and the latest zero is from today", async () => {
        const today = new Date().toISOString().slice(0, 10);
        insertPortfolioValue(0, 0, `${today}T01:00:00.000Z`);

        const point = await portfolioHistoryService.snapshot();
        expect(point).toBeNull();

        const count = dbRef.current!.prepare("SELECT COUNT(*) AS c FROM portfolio_value").get() as { c: number };
        expect(count.c).toBe(1);
    });

    it("writes a new zero row when nothing is tracked and the latest zero is from a previous day", async () => {
        insertPortfolioValue(0, 0, "2026-04-20T10:00:00.000Z");

        const point = await portfolioHistoryService.snapshot();
        expect(point).not.toBeNull();
        expect(point!.btc).toBe(0);

        const count = dbRef.current!.prepare("SELECT COUNT(*) AS c FROM portfolio_value").get() as { c: number };
        expect(count.c).toBe(2);
    });
});

describe("PortfolioHistoryService.valueAt", () => {
    it("returns 0 for empty history", () => {
        expect(portfolioHistoryService.valueAt([], new Date("2026-04-01"))).toBe(0);
    });

    it("clamps to the first point when target is before the recorded range", () => {
        const history = [
            { date: "2026-04-10T00:00:00.000Z", btc: 0.5, usd: 0 },
            { date: "2026-04-20T00:00:00.000Z", btc: 0.7, usd: 0 },
        ];
        expect(portfolioHistoryService.valueAt(history, new Date("2026-03-01T00:00:00.000Z"))).toBe(0.5);
    });

    it("clamps to the last point when target is after the recorded range", () => {
        const history = [
            { date: "2026-04-10T00:00:00.000Z", btc: 0.5, usd: 0 },
            { date: "2026-04-20T00:00:00.000Z", btc: 0.7, usd: 0 },
        ];
        expect(portfolioHistoryService.valueAt(history, new Date("2026-05-01T00:00:00.000Z"))).toBe(0.7);
    });

    it("returns the point's value on an exact match", () => {
        const history = [
            { date: "2026-04-10T00:00:00.000Z", btc: 0.5, usd: 0 },
            { date: "2026-04-20T00:00:00.000Z", btc: 0.7, usd: 0 },
            { date: "2026-04-30T00:00:00.000Z", btc: 0.9, usd: 0 },
        ];
        expect(portfolioHistoryService.valueAt(history, new Date("2026-04-20T00:00:00.000Z"))).toBe(0.7);
    });

    it("linearly interpolates between two surrounding points", () => {
        const history = [
            { date: "2026-04-10T00:00:00.000Z", btc: 0.5, usd: 0 },
            { date: "2026-04-20T00:00:00.000Z", btc: 0.7, usd: 0 },
        ];
        // halfway between => midpoint of btc
        const mid = portfolioHistoryService.valueAt(history, new Date("2026-04-15T00:00:00.000Z"));
        expect(mid).toBeCloseTo(0.6, 10);

        // one quarter of the way
        const quarter = portfolioHistoryService.valueAt(history, new Date("2026-04-12T12:00:00.000Z"));
        expect(quarter).toBeCloseTo(0.55, 10);
    });

    it("interpolates across the right bracket when many points exist", () => {
        const history = [
            { date: "2026-01-01T00:00:00.000Z", btc: 0.0, usd: 0 },
            { date: "2026-02-01T00:00:00.000Z", btc: 0.1, usd: 0 },
            { date: "2026-03-01T00:00:00.000Z", btc: 0.4, usd: 0 },
            { date: "2026-04-01T00:00:00.000Z", btc: 0.5, usd: 0 },
            { date: "2026-05-01T00:00:00.000Z", btc: 1.0, usd: 0 },
        ];
        // April 16 is roughly halfway between Apr 1 (0.5) and May 1 (1.0)
        const result = portfolioHistoryService.valueAt(history, new Date("2026-04-16T00:00:00.000Z"));
        expect(result).toBeGreaterThan(0.5);
        expect(result).toBeLessThan(1.0);
        expect(result).toBeCloseTo(0.75, 1);
    });
});
