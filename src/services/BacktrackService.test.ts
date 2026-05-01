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
    fetch: vi.fn().mockRejectedValue(new Error("network blocked in tests")),
}));

import { BacktrackService } from "./BacktrackService";

const migrationsDir = join(process.cwd(), "src-tauri", "migrations");
const migrationSql = readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((f) => readFileSync(join(migrationsDir, f), "utf8"))
    .join("\n");

const ORIGINAL_USE_MOCK = Config.useMockData;

// Three sample dates to exercise grouping. block_time is a Unix epoch second.
// 1_700_000_000 → 2023-11-14 22:13:20 UTC
// 1_700_086_400 → 2023-11-15 22:13:20 UTC
// 1_700_500_000 → 2023-11-20 17:06:40 UTC
const TX_TIME_NOV14 = 1_700_000_000;
const TX_TIME_NOV15 = 1_700_086_400;
const TX_TIME_NOV20 = 1_700_500_000;

beforeEach(() => {
    const db = new Database(":memory:");
    db.pragma("foreign_keys = ON");
    db.exec(migrationSql);
    dbRef.current = db;
    (Config as { useMockData: boolean }).useMockData = false;
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network blocked in tests")));
});

afterEach(() => {
    dbRef.current?.close();
    dbRef.current = null;
    (Config as { useMockData: boolean }).useMockData = ORIGINAL_USE_MOCK;
    vi.unstubAllGlobals();
});

function insertAddress(uuid: string, address: string): number {
    const info = dbRef
        .current!.prepare("INSERT INTO addresses (uuid, label, address, address_type) VALUES (?, ?, ?, ?)")
        .run(uuid, "Test", address, "P2WPKH");
    return Number(info.lastInsertRowid);
}

function insertXpub(uuid: string): number {
    const info = dbRef
        .current!.prepare("INSERT INTO xpubs (uuid, label, xpub, derivation_type, address_count) VALUES (?, ?, ?, ?, ?)")
        .run(uuid, "Test", `zpub-${uuid}`, "P2WPKH", 20);
    return Number(info.lastInsertRowid);
}

function insertXpubAddress(xpubId: number, address: string, index: number): number {
    const info = dbRef
        .current!.prepare("INSERT INTO xpub_addresses (uuid, xpub_id, address, derivation_path, address_index) VALUES (?, ?, ?, ?, ?)")
        .run(crypto.randomUUID(), xpubId, address, `m/0/${index}`, index);
    return Number(info.lastInsertRowid);
}

function insertAddressTx(addressId: number, amountSat: number, blockTime: number | null) {
    dbRef
        .current!.prepare(
            "INSERT INTO address_transactions (uuid, txid, address_id, amount_sat, block_time, confirmed) VALUES (?, ?, ?, ?, ?, ?)",
        )
        .run(crypto.randomUUID(), crypto.randomUUID(), addressId, amountSat, blockTime, blockTime === null ? 0 : 1);
}

function insertXpubAddressTx(xpubAddressId: number, amountSat: number, blockTime: number | null) {
    dbRef
        .current!.prepare(
            "INSERT INTO xpub_address_transactions (uuid, txid, xpub_address_id, amount_sat, block_time, confirmed) VALUES (?, ?, ?, ?, ?, ?)",
        )
        .run(crypto.randomUUID(), crypto.randomUUID(), xpubAddressId, amountSat, blockTime, blockTime === null ? 0 : 1);
}

function insertHistoricalPrice(date: string, price: number) {
    dbRef.current!.prepare("INSERT INTO historical_prices (date, price, source) VALUES (?, ?, ?)").run(date, price, "test");
}

const service = new BacktrackService();

describe("BacktrackService.backtrackAddress", () => {
    it("collapses transactions on the same UTC day into a single end-of-day snapshot with the running balance", async () => {
        const addressId = insertAddress("addr-uuid", "bc1qaddr");
        // Two txs same day, one tx the next day. Net balance after each day:
        //  2023-11-14 → 100_000 - 25_000 = 75_000 sat
        //  2023-11-20 → 75_000 + 50_000 = 125_000 sat
        insertAddressTx(addressId, 100_000, TX_TIME_NOV14);
        insertAddressTx(addressId, -25_000, TX_TIME_NOV14 + 60); // same UTC day
        insertAddressTx(addressId, 50_000, TX_TIME_NOV20);

        insertHistoricalPrice("2023-11-14", 36_000);
        insertHistoricalPrice("2023-11-20", 37_500);

        await service.backtrackAddress("addr-uuid");

        const rows = dbRef
            .current!.prepare(
                "SELECT balance_btc, balance_usd, tx_count, fetched_at FROM address_balances WHERE address_id = ? ORDER BY fetched_at",
            )
            .all(addressId) as { balance_btc: number; balance_usd: number; tx_count: number; fetched_at: string }[];

        expect(rows).toHaveLength(2);
        expect(rows[0].fetched_at).toBe("2023-11-14T23:59:59Z");
        expect(rows[0].balance_btc).toBeCloseTo(0.00075, 8);
        expect(rows[0].tx_count).toBe(2);
        expect(rows[0].balance_usd).toBeCloseTo(0.00075 * 36_000, 6);

        expect(rows[1].fetched_at).toBe("2023-11-20T23:59:59Z");
        expect(rows[1].balance_btc).toBeCloseTo(0.00125, 8);
        expect(rows[1].tx_count).toBe(3);
        expect(rows[1].balance_usd).toBeCloseTo(0.00125 * 37_500, 6);
    });

    it("ignores pending (block_time NULL) transactions when synthesizing snapshots", async () => {
        const addressId = insertAddress("addr-uuid", "bc1qaddr");
        insertAddressTx(addressId, 100_000, TX_TIME_NOV14);
        insertAddressTx(addressId, 999_999, null); // pending — must not contribute

        insertHistoricalPrice("2023-11-14", 30_000);

        await service.backtrackAddress("addr-uuid");

        const rows = dbRef.current!.prepare("SELECT balance_btc, tx_count FROM address_balances WHERE address_id = ?").all(addressId) as {
            balance_btc: number;
            tx_count: number;
        }[];
        expect(rows).toHaveLength(1);
        expect(rows[0].balance_btc).toBeCloseTo(0.001, 8);
        expect(rows[0].tx_count).toBe(1);
    });

    it("preserves live (today) snapshots and only replaces historical rows", async () => {
        const addressId = insertAddress("addr-uuid", "bc1qaddr");
        insertAddressTx(addressId, 100_000, TX_TIME_NOV14);
        insertHistoricalPrice("2023-11-14", 30_000);

        // Live snapshot from the live balance flow at "now". Backtrack must
        // not delete this — it represents the current spot-priced balance.
        const todayIso = new Date().toISOString();
        dbRef
            .current!.prepare(
                "INSERT INTO address_balances (uuid, address_id, balance_btc, balance_usd, tx_count, fetched_at) VALUES (?, ?, ?, ?, ?, ?)",
            )
            .run(crypto.randomUUID(), addressId, 0.5, 50_000, 7, todayIso);

        // Stale historical snapshot from a previous backtrack — should be
        // wiped and replaced with the freshly computed one.
        dbRef
            .current!.prepare(
                "INSERT INTO address_balances (uuid, address_id, balance_btc, balance_usd, tx_count, fetched_at) VALUES (?, ?, ?, ?, ?, ?)",
            )
            .run(crypto.randomUUID(), addressId, 99, 99_999, 99, "2023-11-14T23:59:59Z");

        await service.backtrackAddress("addr-uuid");

        const rows = dbRef
            .current!.prepare("SELECT balance_btc, fetched_at FROM address_balances WHERE address_id = ? ORDER BY fetched_at")
            .all(addressId) as { balance_btc: number; fetched_at: string }[];

        // Two rows: the historical one (replaced, 0.001 BTC = 100_000 sat) and
        // the live one (preserved, 0.5 BTC).
        expect(rows).toHaveLength(2);
        expect(rows[0].fetched_at).toBe("2023-11-14T23:59:59Z");
        expect(rows[0].balance_btc).toBeCloseTo(0.001, 8);
        expect(rows[1].fetched_at).toBe(todayIso);
        expect(rows[1].balance_btc).toBe(0.5);
    });

    it("rebuilds portfolio_value from all balance snapshots, wiping prior rows", async () => {
        const addressId = insertAddress("addr-uuid", "bc1qaddr");
        insertAddressTx(addressId, 100_000, TX_TIME_NOV14);
        insertAddressTx(addressId, 50_000, TX_TIME_NOV20);
        insertHistoricalPrice("2023-11-14", 36_000);
        insertHistoricalPrice("2023-11-20", 37_500);

        // Pretend portfolio_value already had stale rows from a previous run —
        // they should not survive the rebuild.
        dbRef
            .current!.prepare("INSERT INTO portfolio_value (uuid, balance_btc, balance_usd, fetched_at) VALUES (?, ?, ?, ?)")
            .run(crypto.randomUUID(), 999, 999_999, "2010-01-01T00:00:00Z");

        await service.backtrackAddress("addr-uuid");

        const rows = dbRef
            .current!.prepare("SELECT balance_btc, balance_usd, fetched_at FROM portfolio_value ORDER BY fetched_at")
            .all() as { balance_btc: number; balance_usd: number; fetched_at: string }[];

        expect(rows).toHaveLength(2);
        expect(rows[0].fetched_at).toBe("2023-11-14T23:59:59Z");
        expect(rows[0].balance_btc).toBeCloseTo(0.001, 8);
        expect(rows[1].fetched_at).toBe("2023-11-20T23:59:59Z");
        expect(rows[1].balance_btc).toBeCloseTo(0.0015, 8);
    });

    it("is a no-op for an unknown address uuid", async () => {
        await service.backtrackAddress("nonexistent");
        const count = (dbRef.current!.prepare("SELECT COUNT(*) AS c FROM address_balances").get() as { c: number }).c;
        expect(count).toBe(0);
    });
});

describe("BacktrackService.backtrackXpub", () => {
    it("aggregates per-derived-address snapshots into xpub-level rows priced from historical_prices", async () => {
        const xpubId = insertXpub("xpub-uuid");
        const d0 = insertXpubAddress(xpubId, "bc1qderived0", 0);
        const d1 = insertXpubAddress(xpubId, "bc1qderived1", 1);

        // d0: receives 100_000 on Nov 14
        // d1: receives 200_000 on Nov 15, then sends 50_000 on Nov 20
        insertXpubAddressTx(d0, 100_000, TX_TIME_NOV14);
        insertXpubAddressTx(d1, 200_000, TX_TIME_NOV15);
        insertXpubAddressTx(d1, -50_000, TX_TIME_NOV20);

        insertHistoricalPrice("2023-11-14", 36_000);
        insertHistoricalPrice("2023-11-15", 36_500);
        insertHistoricalPrice("2023-11-20", 37_500);

        await service.backtrackXpub("xpub-uuid");

        // Per-derived rows
        const d0Rows = dbRef
            .current!.prepare("SELECT balance_btc, fetched_at FROM xpub_address_balances WHERE xpub_address_id = ? ORDER BY fetched_at")
            .all(d0) as { balance_btc: number; fetched_at: string }[];
        expect(d0Rows).toEqual([{ balance_btc: 0.001, fetched_at: "2023-11-14T23:59:59Z" }]);

        const d1Rows = dbRef
            .current!.prepare("SELECT balance_btc, fetched_at FROM xpub_address_balances WHERE xpub_address_id = ? ORDER BY fetched_at")
            .all(d1) as { balance_btc: number; fetched_at: string }[];
        expect(d1Rows).toHaveLength(2);
        expect(d1Rows[0].fetched_at).toBe("2023-11-15T23:59:59Z");
        expect(d1Rows[0].balance_btc).toBeCloseTo(0.002, 8);
        expect(d1Rows[1].fetched_at).toBe("2023-11-20T23:59:59Z");
        expect(d1Rows[1].balance_btc).toBeCloseTo(0.0015, 8);

        // Xpub aggregate rows: one per UTC day any derived address moved.
        // 2023-11-14 → d0=0.001, d1=0
        // 2023-11-15 → d0=0.001, d1=0.002 → 0.003
        // 2023-11-20 → d0=0.001, d1=0.0015 → 0.0025
        const xpubRows = dbRef
            .current!.prepare("SELECT balance_btc, balance_usd, fetched_at FROM xpub_balances WHERE xpub_id = ? ORDER BY fetched_at")
            .all(xpubId) as { balance_btc: number; balance_usd: number; fetched_at: string }[];
        expect(xpubRows).toHaveLength(3);
        expect(xpubRows[0].fetched_at).toBe("2023-11-14T23:59:59Z");
        expect(xpubRows[0].balance_btc).toBeCloseTo(0.001, 8);
        expect(xpubRows[1].fetched_at).toBe("2023-11-15T23:59:59Z");
        expect(xpubRows[1].balance_btc).toBeCloseTo(0.003, 8);
        expect(xpubRows[2].fetched_at).toBe("2023-11-20T23:59:59Z");
        expect(xpubRows[2].balance_btc).toBeCloseTo(0.0025, 8);
        expect(xpubRows[2].balance_usd).toBeCloseTo(0.0025 * 37_500, 6);
    });

    it("is a no-op for an unknown xpub uuid", async () => {
        await service.backtrackXpub("nonexistent");
        const count = (dbRef.current!.prepare("SELECT COUNT(*) AS c FROM xpub_balances").get() as { c: number }).c;
        expect(count).toBe(0);
    });
});

describe("BacktrackService.rebuildPortfolioValues", () => {
    it("sums latest-as-of-day balances across both addresses and xpubs", async () => {
        // Address: 0.001 BTC on Nov 14.
        const addressId = insertAddress("addr-uuid", "bc1qaddr");
        insertAddressTx(addressId, 100_000, TX_TIME_NOV14);

        // Xpub: gains 0.002 BTC on Nov 15.
        const xpubId = insertXpub("xpub-uuid");
        const d0 = insertXpubAddress(xpubId, "bc1qderived0", 0);
        insertXpubAddressTx(d0, 200_000, TX_TIME_NOV15);

        insertHistoricalPrice("2023-11-14", 36_000);
        insertHistoricalPrice("2023-11-15", 36_500);

        // Backfill in two passes (skip the rebuild on the first so we can
        // exercise the explicit rebuild path on the second).
        await service.backtrackAddress("addr-uuid", { skipPortfolioRebuild: true });
        await service.backtrackXpub("xpub-uuid", { skipPortfolioRebuild: true });
        await service.rebuildPortfolioValues();

        const rows = dbRef
            .current!.prepare("SELECT balance_btc, balance_usd, fetched_at FROM portfolio_value ORDER BY fetched_at")
            .all() as { balance_btc: number; balance_usd: number; fetched_at: string }[];

        // Two days of activity → two portfolio_value rows.
        // Nov 14: address 0.001, xpub 0   → 0.001 BTC
        // Nov 15: address 0.001, xpub 0.002 → 0.003 BTC
        expect(rows).toHaveLength(2);
        expect(rows[0].fetched_at).toBe("2023-11-14T23:59:59Z");
        expect(rows[0].balance_btc).toBeCloseTo(0.001, 8);
        expect(rows[0].balance_usd).toBeCloseTo(0.001 * 36_000, 6);
        expect(rows[1].fetched_at).toBe("2023-11-15T23:59:59Z");
        expect(rows[1].balance_btc).toBeCloseTo(0.003, 8);
        expect(rows[1].balance_usd).toBeCloseTo(0.003 * 36_500, 6);
    });

    it("wipes portfolio_value and writes nothing when there are no balance snapshots at all", async () => {
        dbRef
            .current!.prepare("INSERT INTO portfolio_value (uuid, balance_btc, balance_usd, fetched_at) VALUES (?, ?, ?, ?)")
            .run(crypto.randomUUID(), 1, 1, "2020-01-01T00:00:00Z");

        await service.rebuildPortfolioValues();

        const count = (dbRef.current!.prepare("SELECT COUNT(*) AS c FROM portfolio_value").get() as { c: number }).c;
        expect(count).toBe(0);
    });
});
