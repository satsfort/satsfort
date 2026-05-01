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

import { TransactionHistoryRequests } from "./TransactionHistoryRequests";

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

function insertAddress(uuid: string, label: string, address: string): number {
    const info = dbRef
        .current!.prepare("INSERT INTO addresses (uuid, label, address, address_type) VALUES (?, ?, ?, ?)")
        .run(uuid, label, address, "P2WPKH");
    return Number(info.lastInsertRowid);
}

function insertXpub(uuid: string, label: string, xpub: string): number {
    const info = dbRef
        .current!.prepare("INSERT INTO xpubs (uuid, label, xpub, derivation_type, address_count) VALUES (?, ?, ?, ?, ?)")
        .run(uuid, label, xpub, "P2WPKH", 20);
    return Number(info.lastInsertRowid);
}

function insertXpubAddress(xpubId: number, address: string, index: number): number {
    const info = dbRef
        .current!.prepare("INSERT INTO xpub_addresses (uuid, xpub_id, address, derivation_path, address_index) VALUES (?, ?, ?, ?, ?)")
        .run(crypto.randomUUID(), xpubId, address, `m/0/${index}`, index);
    return Number(info.lastInsertRowid);
}

function countTransactions(): number {
    const a = (dbRef.current!.prepare("SELECT COUNT(*) AS c FROM address_transactions").get() as { c: number }).c;
    const x = (dbRef.current!.prepare("SELECT COUNT(*) AS c FROM xpub_address_transactions").get() as { c: number }).c;
    return a + x;
}

const transactionHistoryRequests = new TransactionHistoryRequests();

describe("TransactionHistoryRequests.upsertMany", () => {
    it("inserts transactions for an address with the address foreign key set", async () => {
        const addressId = insertAddress("addr-uuid", "Cold storage", "bc1qaddr1");

        await transactionHistoryRequests.upsertMany({ kind: "address", addressId }, [
            { txid: "tx1", amountSat: 50_000, blockTime: 1_700_000_000, confirmed: true },
            { txid: "tx2", amountSat: -25_000, blockTime: 1_700_100_000, confirmed: true },
        ]);

        expect(countTransactions()).toBe(2);
        const rows = dbRef.current!.prepare("SELECT txid, address_id, amount_sat FROM address_transactions ORDER BY id").all();
        expect(rows).toEqual([
            { txid: "tx1", address_id: addressId, amount_sat: 50_000 },
            { txid: "tx2", address_id: addressId, amount_sat: -25_000 },
        ]);
    });

    it("dedupes by (txid, address_id) on re-fetch via the unique constraint", async () => {
        const addressId = insertAddress("addr-uuid", "Cold storage", "bc1qaddr1");
        const tx = { txid: "tx-shared", amountSat: 10_000, blockTime: 1_700_000_000, confirmed: true };

        await transactionHistoryRequests.upsertMany({ kind: "address", addressId }, [tx]);
        await transactionHistoryRequests.upsertMany({ kind: "address", addressId }, [tx]);

        expect(countTransactions()).toBe(1);
    });

    it("allows the same txid for an address row and an xpub-derived address row", async () => {
        const addressId = insertAddress("addr-uuid", "Cold storage", "bc1qaddr1");
        const xpubId = insertXpub("xpub-uuid", "Wallet", "zpub-xyz");
        const xpubAddressId = insertXpubAddress(xpubId, "bc1qderived0", 0);

        await transactionHistoryRequests.upsertMany({ kind: "address", addressId }, [
            { txid: "tx-shared", amountSat: 1, blockTime: 1, confirmed: true },
        ]);
        await transactionHistoryRequests.upsertMany({ kind: "xpubAddress", xpubAddressId }, [
            { txid: "tx-shared", amountSat: 2, blockTime: 2, confirmed: true },
        ]);

        expect(countTransactions()).toBe(2);
    });

    it("is a no-op when given an empty list", async () => {
        const addressId = insertAddress("addr-uuid", "Cold storage", "bc1qaddr1");
        await transactionHistoryRequests.upsertMany({ kind: "address", addressId }, []);
        expect(countTransactions()).toBe(0);
    });

    it("promotes a pending address tx to confirmed when re-ingested with a block_time", async () => {
        const addressId = insertAddress("addr-uuid", "Cold storage", "bc1qaddr1");

        await transactionHistoryRequests.upsertMany({ kind: "address", addressId }, [
            { txid: "tx-once-pending", amountSat: 50_000, blockTime: null, confirmed: false },
        ]);

        const pending = dbRef
            .current!.prepare("SELECT block_time, confirmed FROM address_transactions WHERE txid = ?")
            .get("tx-once-pending") as { block_time: number | null; confirmed: number };
        expect(pending.block_time).toBeNull();
        expect(pending.confirmed).toBe(0);

        await transactionHistoryRequests.upsertMany({ kind: "address", addressId }, [
            { txid: "tx-once-pending", amountSat: 50_000, blockTime: 1_700_000_000, confirmed: true },
        ]);

        // Still one row (UPSERT, not duplicate insert) and now confirmed.
        expect(countTransactions()).toBe(1);
        const promoted = dbRef
            .current!.prepare("SELECT block_time, confirmed FROM address_transactions WHERE txid = ?")
            .get("tx-once-pending") as { block_time: number | null; confirmed: number };
        expect(promoted.block_time).toBe(1_700_000_000);
        expect(promoted.confirmed).toBe(1);
    });

    it("promotes a pending xpub-address tx to confirmed when re-ingested with a block_time", async () => {
        const xpubId = insertXpub("xpub-uuid", "Wallet", "zpub-xyz");
        const xpubAddressId = insertXpubAddress(xpubId, "bc1qderived0", 0);

        await transactionHistoryRequests.upsertMany({ kind: "xpubAddress", xpubAddressId }, [
            { txid: "tx-pending-xpub", amountSat: 12_345, blockTime: null, confirmed: false },
        ]);
        await transactionHistoryRequests.upsertMany({ kind: "xpubAddress", xpubAddressId }, [
            { txid: "tx-pending-xpub", amountSat: 12_345, blockTime: 1_700_500_000, confirmed: true },
        ]);

        expect(countTransactions()).toBe(1);
        const promoted = dbRef
            .current!.prepare("SELECT block_time, confirmed FROM xpub_address_transactions WHERE txid = ?")
            .get("tx-pending-xpub") as { block_time: number | null; confirmed: number };
        expect(promoted.block_time).toBe(1_700_500_000);
        expect(promoted.confirmed).toBe(1);
    });
});

describe("TransactionHistoryRequests.listRecent", () => {
    it("orders by block_time descending and joins the owning label", async () => {
        const addressId = insertAddress("addr-uuid", "Cold storage", "bc1qaddr1");
        const xpubId = insertXpub("xpub-uuid", "Hot wallet", "zpub-xyz");
        const xpubAddressId = insertXpubAddress(xpubId, "bc1qderived0", 0);

        await transactionHistoryRequests.upsertMany({ kind: "address", addressId }, [
            { txid: "tx-old", amountSat: 5_000, blockTime: 1_000, confirmed: true },
        ]);
        await transactionHistoryRequests.upsertMany({ kind: "xpubAddress", xpubAddressId }, [
            { txid: "tx-new", amountSat: 1_000, blockTime: 2_000, confirmed: true },
        ]);

        const rows = await transactionHistoryRequests.listRecent(10);
        expect(rows.map((r) => r.txid)).toEqual(["tx-new", "tx-old"]);
        expect(rows[0].label).toBe("Hot wallet");
        expect(rows[1].label).toBe("Cold storage");
    });

    it("respects the limit", async () => {
        const addressId = insertAddress("addr-uuid", "Cold storage", "bc1qaddr1");
        await transactionHistoryRequests.upsertMany(
            { kind: "address", addressId },
            Array.from({ length: 5 }, (_, i) => ({ txid: `tx${i}`, amountSat: i, blockTime: i, confirmed: true })),
        );

        const rows = await transactionHistoryRequests.listRecent(3);
        expect(rows).toHaveLength(3);
    });

    it("places unconfirmed (null block_time) entries before confirmed ones", async () => {
        const addressId = insertAddress("addr-uuid", "Cold storage", "bc1qaddr1");
        await transactionHistoryRequests.upsertMany({ kind: "address", addressId }, [
            { txid: "tx-confirmed", amountSat: 1, blockTime: 1_700_000_000, confirmed: true },
            { txid: "tx-pending", amountSat: 2, blockTime: null, confirmed: false },
        ]);

        const rows = await transactionHistoryRequests.listRecent(10);
        expect(rows.map((r) => r.txid)).toEqual(["tx-pending", "tx-confirmed"]);
    });
});

describe("TransactionHistoryRequests.deleteForAddressUuid / deleteForXpubUuid", () => {
    it("removes only this address's transactions, leaving xpub-owned ones intact", async () => {
        const addressId = insertAddress("addr-uuid", "Cold storage", "bc1qaddr1");
        const xpubId = insertXpub("xpub-uuid", "Hot wallet", "zpub-xyz");
        const xpubAddressId = insertXpubAddress(xpubId, "bc1qderived0", 0);

        await transactionHistoryRequests.upsertMany({ kind: "address", addressId }, [
            { txid: "tx-a", amountSat: 1, blockTime: 1, confirmed: true },
        ]);
        await transactionHistoryRequests.upsertMany({ kind: "xpubAddress", xpubAddressId }, [
            { txid: "tx-x", amountSat: 1, blockTime: 1, confirmed: true },
        ]);

        await transactionHistoryRequests.deleteForAddressUuid("addr-uuid");

        const aRows = dbRef.current!.prepare("SELECT txid FROM address_transactions").all() as { txid: string }[];
        const xRows = dbRef.current!.prepare("SELECT txid FROM xpub_address_transactions").all() as { txid: string }[];
        expect(aRows).toEqual([]);
        expect(xRows).toEqual([{ txid: "tx-x" }]);
    });

    it("removes every transaction owned by an xpub's derived addresses", async () => {
        const xpubId = insertXpub("xpub-uuid", "Hot wallet", "zpub-xyz");
        const a0 = insertXpubAddress(xpubId, "bc1qderived0", 0);
        const a1 = insertXpubAddress(xpubId, "bc1qderived1", 1);

        await transactionHistoryRequests.upsertMany({ kind: "xpubAddress", xpubAddressId: a0 }, [
            { txid: "tx-0", amountSat: 1, blockTime: 1, confirmed: true },
        ]);
        await transactionHistoryRequests.upsertMany({ kind: "xpubAddress", xpubAddressId: a1 }, [
            { txid: "tx-1", amountSat: 2, blockTime: 2, confirmed: true },
        ]);

        await transactionHistoryRequests.deleteForXpubUuid("xpub-uuid");

        expect(countTransactions()).toBe(0);
    });

    it("cascades transactions when an address row is deleted directly (FK ON DELETE CASCADE)", async () => {
        const addressId = insertAddress("addr-uuid", "Cold storage", "bc1qaddr1");
        await transactionHistoryRequests.upsertMany({ kind: "address", addressId }, [
            { txid: "tx", amountSat: 1, blockTime: 1, confirmed: true },
        ]);

        dbRef.current!.prepare("DELETE FROM addresses WHERE uuid = ?").run("addr-uuid");
        expect(countTransactions()).toBe(0);
    });

    it("cascades transactions when an xpub_address row is deleted directly", async () => {
        const xpubId = insertXpub("xpub-uuid", "Hot wallet", "zpub-xyz");
        const xpubAddressId = insertXpubAddress(xpubId, "bc1qderived0", 0);
        await transactionHistoryRequests.upsertMany({ kind: "xpubAddress", xpubAddressId }, [
            { txid: "tx", amountSat: 1, blockTime: 1, confirmed: true },
        ]);

        dbRef.current!.prepare("DELETE FROM xpub_addresses WHERE id = ?").run(xpubAddressId);
        expect(countTransactions()).toBe(0);
    });
});

describe("TransactionHistoryRequests.findAddressInternalIdByUuid / findXpubAddressIdsByXpubUuid", () => {
    it("resolves an address uuid to the integer primary key", async () => {
        const addressId = insertAddress("addr-uuid", "Cold storage", "bc1qaddr1");
        const found = await transactionHistoryRequests.findAddressInternalIdByUuid("addr-uuid");
        expect(found).toBe(addressId);
    });

    it("returns null when the uuid is unknown", async () => {
        const found = await transactionHistoryRequests.findAddressInternalIdByUuid("missing");
        expect(found).toBeNull();
    });

    it("lists every derived address row for an xpub uuid in deterministic order", async () => {
        const xpubId = insertXpub("xpub-uuid", "Hot wallet", "zpub-xyz");
        const a0 = insertXpubAddress(xpubId, "bc1qderived0", 0);
        const a1 = insertXpubAddress(xpubId, "bc1qderived1", 1);

        const rows = await transactionHistoryRequests.findXpubAddressIdsByXpubUuid("xpub-uuid");
        expect(rows).toEqual([
            { id: a0, address: "bc1qderived0" },
            { id: a1, address: "bc1qderived1" },
        ]);
    });
});
