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

const blockchainGet = vi.hoisted(() => vi.fn());
const spotPriceExecute = vi.hoisted(() => vi.fn());

vi.mock("../requests/BlockchainBalanceRequests", () => ({
    BlockchainBalanceRequests: class {
        get = blockchainGet;
    },
}));

vi.mock("../requests/SpotPriceRequests", () => ({
    SpotPriceRequests: class {
        execute = spotPriceExecute;
    },
}));

import { AddressBalanceService } from "./AddressBalanceService";
import { PortfolioHistoryService } from "./PortfolioHistoryService";

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
    (Config as { useMockData: boolean }).useMockData = false;
    blockchainGet.mockReset();
    spotPriceExecute.mockReset();
});

afterEach(() => {
    dbRef.current?.close();
    dbRef.current = null;
});

describe("addAddress → balance fetch → portfolio snapshot integration", () => {
    it("makes the snapshot reflect the newly fetched balance", async () => {
        // Simulates the AddressesPage handleAddAddress flow.
        const db = dbRef.current!;
        const addressBalanceService = new AddressBalanceService();
        const portfolioHistoryService = new PortfolioHistoryService();

        // Step 1: TrackedAddressesService.add inserts an address row.
        db.prepare("INSERT INTO addresses (uuid, label, address, address_type) VALUES (?, ?, ?, ?)").run(
            "addr-uuid",
            "Cold storage",
            "bc1qreal",
            "P2WPKH",
        );

        // Step 2: addressBalanceService.get fetches and persists the balance.
        spotPriceExecute.mockResolvedValue({ usd: 100_000 });
        blockchainGet.mockResolvedValue({ address: "bc1qreal", btc: 0.5, txCount: 3, lastSeen: "2026-05-01" });

        const balance = await addressBalanceService.get("bc1qreal");
        expect(balance.btc).toBe(0.5);

        // Step 3: verify addresses.latest_balance_btc was actually written.
        const addrRow = db.prepare("SELECT latest_balance_btc, latest_balance_usd FROM addresses WHERE address = ?").get("bc1qreal") as {
            latest_balance_btc: number | null;
            latest_balance_usd: number | null;
        };
        expect(addrRow.latest_balance_btc).toBeCloseTo(0.5, 8);
        expect(addrRow.latest_balance_usd).toBeCloseTo(50_000, 4);

        // Step 4: snapshot should pick up that new balance.
        const point = await portfolioHistoryService.snapshot();
        expect(point).not.toBeNull();
        expect(point!.btc).toBeCloseTo(0.5, 8);
        expect(point!.usd).toBeCloseTo(50_000, 4);
    });
});
