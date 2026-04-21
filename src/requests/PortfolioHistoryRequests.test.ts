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

function insertAddress(address: string, label: string, balanceBtc: number | null) {
    const db = dbRef.current!;
    db.prepare(
        "INSERT INTO addresses (uuid, label, address, address_type, latest_balance_btc) VALUES (?, ?, ?, ?, ?)",
    ).run(crypto.randomUUID(), label, address, "P2WPKH", balanceBtc);
}

function insertXpub(label: string, xpubKey: string, balanceBtc: number | null) {
    const db = dbRef.current!;
    db.prepare(
        "INSERT INTO xpubs (uuid, label, xpub, derivation_type, address_count, latest_balance_btc) VALUES (?, ?, ?, ?, ?, ?)",
    ).run(crypto.randomUUID(), label, xpubKey, "P2WPKH", 20, balanceBtc);
}

describe("PortfolioHistoryRequests.snapshot", () => {
    it("records zero when no addresses or xpubs are tracked", async () => {
        const point = await new PortfolioHistoryRequests().snapshot();
        expect(point.btc).toBe(0);

        const row = dbRef.current!.prepare("SELECT balance_btc FROM portfolio_value").get() as { balance_btc: number };
        expect(row.balance_btc).toBe(0);
    });

    it("sums latest_balance_btc across addresses and xpubs", async () => {
        insertAddress("bc1qaddr1", "Addr 1", 0.5);
        insertAddress("bc1qaddr2", "Addr 2", 0.25);
        insertXpub("Xpub A", "zpub-a", 1.0);
        insertXpub("Xpub B", "zpub-b", 0.125);

        const point = await new PortfolioHistoryRequests().snapshot();
        expect(point.btc).toBeCloseTo(1.875, 8);

        const row = dbRef.current!.prepare("SELECT balance_btc FROM portfolio_value").get() as { balance_btc: number };
        expect(row.balance_btc).toBeCloseTo(1.875, 8);
    });

    it("treats null latest balances as zero", async () => {
        insertAddress("bc1qaddr1", "Addr 1", 0.5);
        insertAddress("bc1qaddr2", "Unseen addr", null);
        insertXpub("Unseen xpub", "zpub-unseen", null);
        insertXpub("Xpub B", "zpub-b", 0.25);

        const point = await new PortfolioHistoryRequests().snapshot();
        expect(point.btc).toBeCloseTo(0.75, 8);
    });

    it("appends a new row on each invocation", async () => {
        insertAddress("bc1qaddr1", "Addr 1", 0.1);

        const requests = new PortfolioHistoryRequests();
        await requests.snapshot();
        await requests.snapshot();
        await requests.snapshot();

        const count = dbRef.current!.prepare("SELECT COUNT(*) AS c FROM portfolio_value").get() as { c: number };
        expect(count.c).toBe(3);
    });
});

describe("PortfolioHistoryRequests.execute", () => {
    it("returns the portfolio_value rows when mock is disabled", async () => {
        insertAddress("bc1qaddr1", "Addr 1", 0.5);

        const requests = new PortfolioHistoryRequests();
        await requests.snapshot();

        const history = await requests.execute();
        expect(history).toHaveLength(1);
        expect(history[0].btc).toBeCloseTo(0.5, 8);
        expect(history[0].date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it("returns rows sorted by fetched_at ascending", async () => {
        const db = dbRef.current!;
        db.prepare("INSERT INTO portfolio_value (uuid, balance_btc, fetched_at) VALUES (?, ?, ?)").run(
            crypto.randomUUID(),
            0.3,
            "2026-03-01T12:00:00.000Z",
        );
        db.prepare("INSERT INTO portfolio_value (uuid, balance_btc, fetched_at) VALUES (?, ?, ?)").run(
            crypto.randomUUID(),
            0.1,
            "2026-01-01T12:00:00.000Z",
        );
        db.prepare("INSERT INTO portfolio_value (uuid, balance_btc, fetched_at) VALUES (?, ?, ?)").run(
            crypto.randomUUID(),
            0.2,
            "2026-02-01T12:00:00.000Z",
        );

        const history = await new PortfolioHistoryRequests().execute();
        expect(history.map((p) => p.btc)).toEqual([0.1, 0.2, 0.3]);
    });

    it("returns the mock history when mock is enabled", async () => {
        (Config as { useMockData: boolean }).useMockData = true;
        const history = await new PortfolioHistoryRequests().execute();
        expect(history.length).toBeGreaterThan(0);
    });
});
