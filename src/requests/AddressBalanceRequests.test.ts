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

import { AddressBalanceRequests } from "./AddressBalanceRequests";

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

function insertAddress(address: string): number {
    const db = dbRef.current!;
    const info = db
        .prepare("INSERT INTO addresses (uuid, label, address, address_type) VALUES (?, ?, ?, ?)")
        .run(crypto.randomUUID(), "label", address, "P2WPKH");
    return info.lastInsertRowid as number;
}

function insertXpubAddress(address: string): number {
    const db = dbRef.current!;
    const xpubInfo = db
        .prepare("INSERT INTO xpubs (uuid, label, xpub, derivation_type, address_count) VALUES (?, ?, ?, ?, ?)")
        .run(crypto.randomUUID(), "xpub-label", "zpub-" + crypto.randomUUID(), "P2WPKH", 1);
    const xpubId = xpubInfo.lastInsertRowid as number;
    const info = db
        .prepare("INSERT INTO xpub_addresses (uuid, xpub_id, address, derivation_path, address_index) VALUES (?, ?, ?, ?, ?)")
        .run(crypto.randomUUID(), xpubId, address, "m/0/0", 0);
    return info.lastInsertRowid as number;
}

const addressBalanceRequests = new AddressBalanceRequests();
const sampleUpdate = { btc: 0.5, usd: 50_000, txCount: 3, fetchedAt: "2026-04-20T08:00:00.000Z" };

describe("AddressBalanceRequests.findAddressIds", () => {
    it("returns ids for a matching address", async () => {
        const id = insertAddress("bc1qaddr1");
        expect(await addressBalanceRequests.findAddressIds("bc1qaddr1")).toEqual([id]);
    });

    it("returns an empty array when no address matches", async () => {
        expect(await addressBalanceRequests.findAddressIds("bc1qmissing")).toEqual([]);
    });
});

describe("AddressBalanceRequests.findXpubAddressIds", () => {
    it("returns ids for a matching xpub-derived address", async () => {
        const id = insertXpubAddress("bc1qxpubaddr");
        expect(await addressBalanceRequests.findXpubAddressIds("bc1qxpubaddr")).toEqual([id]);
    });

    it("returns an empty array when no xpub address matches", async () => {
        expect(await addressBalanceRequests.findXpubAddressIds("bc1qmissing")).toEqual([]);
    });
});

describe("AddressBalanceRequests.updateAddressLatest", () => {
    it("writes the latest balance columns on the addresses row", async () => {
        const id = insertAddress("bc1qaddr1");

        await addressBalanceRequests.updateAddressLatest(id, sampleUpdate);

        const row = dbRef
            .current!.prepare(
                "SELECT latest_balance_btc, latest_balance_usd, latest_tx_count, latest_balance_fetched_at FROM addresses WHERE id = ?",
            )
            .get(id) as {
            latest_balance_btc: number;
            latest_balance_usd: number;
            latest_tx_count: number;
            latest_balance_fetched_at: string;
        };
        expect(row.latest_balance_btc).toBeCloseTo(0.5, 8);
        expect(row.latest_balance_usd).toBeCloseTo(50_000, 4);
        expect(row.latest_tx_count).toBe(3);
        expect(row.latest_balance_fetched_at).toBe("2026-04-20T08:00:00.000Z");
    });
});

describe("AddressBalanceRequests.insertAddressBalanceSnapshot", () => {
    it("appends a row to address_balances", async () => {
        const id = insertAddress("bc1qaddr1");

        await addressBalanceRequests.insertAddressBalanceSnapshot(id, sampleUpdate);
        await addressBalanceRequests.insertAddressBalanceSnapshot(id, { ...sampleUpdate, btc: 0.6, usd: 60_000 });

        const rows = dbRef
            .current!.prepare("SELECT balance_btc, balance_usd, tx_count FROM address_balances WHERE address_id = ? ORDER BY id")
            .all(id) as { balance_btc: number; balance_usd: number; tx_count: number }[];
        expect(rows).toHaveLength(2);
        expect(rows[0].balance_btc).toBeCloseTo(0.5, 8);
        expect(rows[1].balance_btc).toBeCloseTo(0.6, 8);
    });
});

describe("AddressBalanceRequests.updateXpubAddressLatest", () => {
    it("writes the latest balance columns on the xpub_addresses row", async () => {
        const id = insertXpubAddress("bc1qxpubaddr");

        await addressBalanceRequests.updateXpubAddressLatest(id, sampleUpdate);

        const row = dbRef
            .current!.prepare("SELECT latest_balance_btc, latest_balance_usd, latest_tx_count FROM xpub_addresses WHERE id = ?")
            .get(id) as { latest_balance_btc: number; latest_balance_usd: number; latest_tx_count: number };
        expect(row.latest_balance_btc).toBeCloseTo(0.5, 8);
        expect(row.latest_balance_usd).toBeCloseTo(50_000, 4);
        expect(row.latest_tx_count).toBe(3);
    });
});

describe("AddressBalanceRequests.insertXpubAddressBalanceSnapshot", () => {
    it("appends a row to xpub_address_balances", async () => {
        const id = insertXpubAddress("bc1qxpubaddr");

        await addressBalanceRequests.insertXpubAddressBalanceSnapshot(id, sampleUpdate);

        const rows = dbRef
            .current!.prepare("SELECT balance_btc, balance_usd, tx_count FROM xpub_address_balances WHERE xpub_address_id = ?")
            .all(id) as { balance_btc: number; balance_usd: number; tx_count: number }[];
        expect(rows).toHaveLength(1);
        expect(rows[0].balance_btc).toBeCloseTo(0.5, 8);
        expect(rows[0].balance_usd).toBeCloseTo(50_000, 4);
        expect(rows[0].tx_count).toBe(3);
    });
});
