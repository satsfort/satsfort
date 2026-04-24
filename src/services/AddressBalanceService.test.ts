import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import type { Database as SqliteDatabase } from "better-sqlite3";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

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

const TEST_SPOT_USD = 100_000;

vi.mock("../requests/SpotPriceRequests", () => ({
    SpotPriceRequests: class {
        async execute() {
            return { usd: TEST_SPOT_USD, source: "test", asOf: new Date().toISOString() };
        }
    },
}));

import { AddressBalanceService } from "./AddressBalanceService";
import { TrackedAddressesService } from "./TrackedAddressesService";
import { XpubRequests } from "../requests/XpubRequests";

const migrationsDir = join(process.cwd(), "src-tauri", "migrations");
const migrationSql = readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((f) => readFileSync(join(migrationsDir, f), "utf8"))
    .join("\n");

beforeEach(() => {
    const db = new Database(":memory:");
    db.pragma("foreign_keys = ON");
    db.exec(migrationSql);
    dbRef.current = db;
});

afterEach(() => {
    dbRef.current?.close();
    dbRef.current = null;
});

describe("AddressBalanceService persistence", () => {
    const fetchMock = vi.fn();
    const originalFetch = globalThis.fetch;
    let addressBalanceService: AddressBalanceService;
    let trackedAddressesService: TrackedAddressesService;
    let xpubRequests: XpubRequests;

    beforeEach(() => {
        fetchMock.mockReset();
        globalThis.fetch = fetchMock as unknown as typeof fetch;
        addressBalanceService = new AddressBalanceService();
        trackedAddressesService = new TrackedAddressesService();
        xpubRequests = new XpubRequests();
    });

    afterEach(() => {
        globalThis.fetch = originalFetch;
    });

    const mockMempoolResponse = (confirmed: number, unconfirmed: number, txCount: number) => ({
        ok: true,
        status: 200,
        statusText: "OK",
        json: async () => ({
            chain_stats: { funded_txo_sum: confirmed, spent_txo_sum: 0, tx_count: txCount },
            mempool_stats: { funded_txo_sum: unconfirmed, spent_txo_sum: 0, tx_count: 0 },
        }),
    });

    it("updates the tracked address row and appends a snapshot to address_balances", async () => {
        const tracked = await trackedAddressesService.add("bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh", "Hot wallet");

        fetchMock.mockResolvedValueOnce(mockMempoolResponse(25_000_000, 0, 5));

        const result = await addressBalanceService.get(tracked.address);
        expect(result.btc).toBeCloseTo(0.25, 8);
        expect(result.txCount).toBe(5);

        const db = dbRef.current!;
        const row = db
            .prepare(
                "SELECT latest_balance_btc, latest_balance_usd, latest_tx_count, latest_balance_fetched_at FROM addresses WHERE address = ?",
            )
            .get(tracked.address) as {
            latest_balance_btc: number;
            latest_balance_usd: number;
            latest_tx_count: number;
            latest_balance_fetched_at: string;
        };
        expect(row.latest_balance_btc).toBeCloseTo(0.25, 8);
        expect(row.latest_balance_usd).toBeCloseTo(0.25 * TEST_SPOT_USD, 4);
        expect(row.latest_tx_count).toBe(5);
        expect(row.latest_balance_fetched_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);

        const snapshots = db.prepare("SELECT balance_btc, balance_usd, tx_count FROM address_balances").all() as {
            balance_btc: number;
            balance_usd: number;
            tx_count: number;
        }[];
        expect(snapshots).toHaveLength(1);
        expect(snapshots[0].balance_btc).toBeCloseTo(0.25, 8);
        expect(snapshots[0].balance_usd).toBeCloseTo(0.25 * TEST_SPOT_USD, 4);
        expect(snapshots[0].tx_count).toBe(5);
    });

    it("appends a new row for every fetch on the same address", async () => {
        const tracked = await trackedAddressesService.add("bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh", "Hot wallet");

        fetchMock.mockResolvedValueOnce(mockMempoolResponse(10_000_000, 0, 2));
        fetchMock.mockResolvedValueOnce(mockMempoolResponse(20_000_000, 0, 3));

        await addressBalanceService.get(tracked.address);
        await addressBalanceService.get(tracked.address);

        const db = dbRef.current!;
        const snapshots = db.prepare("SELECT balance_btc, tx_count FROM address_balances ORDER BY id").all() as {
            balance_btc: number;
            tx_count: number;
        }[];
        expect(snapshots).toHaveLength(2);
        expect(snapshots[0].balance_btc).toBeCloseTo(0.1, 8);
        expect(snapshots[1].balance_btc).toBeCloseTo(0.2, 8);

        const row = db.prepare("SELECT latest_balance_btc, latest_tx_count FROM addresses WHERE address = ?").get(tracked.address) as {
            latest_balance_btc: number;
            latest_tx_count: number;
        };
        expect(row.latest_balance_btc).toBeCloseTo(0.2, 8);
        expect(row.latest_tx_count).toBe(3);
    });

    it("updates an xpub-derived address and writes to xpub_address_balances", async () => {
        const xpub = "zpub6rFR7y4Q2AijBEqTUquhVz398htDFrtymD9xYYfG1m4wAcvPhXNfE3EfH1r1ADqtfSdVCToUG868RvUUkgDKf31mGDtKsAYz2oz2AGutZYs";
        const { addresses } = await xpubRequests.add(xpub, "Native SegWit", "P2WPKH");
        const target = addresses[0];

        fetchMock.mockResolvedValueOnce(mockMempoolResponse(30_000_000, 0, 4));

        const result = await addressBalanceService.get(target.address);
        expect(result.btc).toBeCloseTo(0.3, 8);

        const db = dbRef.current!;
        const row = db
            .prepare("SELECT latest_balance_btc, latest_balance_usd, latest_tx_count FROM xpub_addresses WHERE address = ?")
            .get(target.address) as { latest_balance_btc: number; latest_balance_usd: number; latest_tx_count: number };
        expect(row.latest_balance_btc).toBeCloseTo(0.3, 8);
        expect(row.latest_balance_usd).toBeCloseTo(0.3 * TEST_SPOT_USD, 4);
        expect(row.latest_tx_count).toBe(4);

        const snapshots = db.prepare("SELECT balance_btc, balance_usd, tx_count FROM xpub_address_balances").all() as {
            balance_btc: number;
            balance_usd: number;
            tx_count: number;
        }[];
        expect(snapshots).toHaveLength(1);
        expect(snapshots[0].balance_btc).toBeCloseTo(0.3, 8);
        expect(snapshots[0].balance_usd).toBeCloseTo(0.3 * TEST_SPOT_USD, 4);
        expect(snapshots[0].tx_count).toBe(4);
    });

    it("is a no-op for addresses that are not tracked", async () => {
        fetchMock.mockResolvedValueOnce(mockMempoolResponse(50_000_000, 0, 1));

        await addressBalanceService.get("bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh");

        const db = dbRef.current!;
        const count = db.prepare("SELECT COUNT(*) AS c FROM address_balances").get() as { c: number };
        expect(count.c).toBe(0);
    });
});
