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

const blockchainGetForAddress = vi.hoisted(() => vi.fn());

vi.mock("../requests/BlockchainTransactionsRequests", () => ({
    BlockchainTransactionsRequests: class {
        getForAddress = blockchainGetForAddress;
    },
}));

import { TransactionHistoryService } from "./TransactionHistoryService";

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
    blockchainGetForAddress.mockReset();
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

function insertXpub(uuid: string, label: string): number {
    const info = dbRef
        .current!.prepare(
            "INSERT INTO xpubs (uuid, label, xpub, derivation_type, address_count) VALUES (?, ?, ?, ?, ?)",
        )
        .run(uuid, label, `zpub-${uuid}`, "P2WPKH", 20);
    return Number(info.lastInsertRowid);
}

function insertXpubAddress(xpubId: number, address: string, index: number) {
    dbRef
        .current!.prepare(
            "INSERT INTO xpub_addresses (uuid, xpub_id, address, derivation_path, address_index) VALUES (?, ?, ?, ?, ?)",
        )
        .run(crypto.randomUUID(), xpubId, address, `m/0/${index}`, index);
}

const service = new TransactionHistoryService();

describe("TransactionHistoryService.ingestForAddress", () => {
    it("fetches via the blockchain API and persists each tx tied to the address", async () => {
        insertAddress("addr-uuid", "Cold storage", "bc1qaddr1");
        blockchainGetForAddress.mockResolvedValueOnce([
            { txid: "tx1", amountSat: 100_000, blockTime: 1_700_000_000, confirmed: true },
            { txid: "tx2", amountSat: -25_000, blockTime: 1_700_500_000, confirmed: true },
        ]);

        await service.ingestForAddress("addr-uuid", "bc1qaddr1");

        expect(blockchainGetForAddress).toHaveBeenCalledWith("bc1qaddr1");
        const rows = dbRef.current!.prepare("SELECT txid, amount_sat FROM transactions ORDER BY id").all();
        expect(rows).toEqual([
            { txid: "tx1", amount_sat: 100_000 },
            { txid: "tx2", amount_sat: -25_000 },
        ]);
    });

    it("is a no-op when the address uuid is not in the addresses table", async () => {
        await service.ingestForAddress("missing", "bc1qmissing");
        expect(blockchainGetForAddress).not.toHaveBeenCalled();
    });
});

describe("TransactionHistoryService.ingestForXpub", () => {
    it("fetches each derived address in parallel and persists the txs", async () => {
        const xpubId = insertXpub("xpub-uuid", "Hot wallet");
        insertXpubAddress(xpubId, "bc1qderived0", 0);
        insertXpubAddress(xpubId, "bc1qderived1", 1);

        blockchainGetForAddress.mockImplementation(async (addr: string) => {
            if (addr === "bc1qderived0") {
                return [{ txid: "tx-0", amountSat: 10_000, blockTime: 1, confirmed: true }];
            }
            return [{ txid: "tx-1", amountSat: 20_000, blockTime: 2, confirmed: true }];
        });

        await service.ingestForXpub("xpub-uuid");

        const count = (dbRef.current!.prepare("SELECT COUNT(*) AS c FROM transactions").get() as { c: number }).c;
        expect(count).toBe(2);
    });

    it("continues ingesting for other derived addresses when one fetch fails", async () => {
        const xpubId = insertXpub("xpub-uuid", "Hot wallet");
        insertXpubAddress(xpubId, "bc1qderived0", 0);
        insertXpubAddress(xpubId, "bc1qderived1", 1);

        blockchainGetForAddress.mockImplementation(async (addr: string) => {
            if (addr === "bc1qderived0") throw new Error("rate limited");
            return [{ txid: "tx-1", amountSat: 20_000, blockTime: 2, confirmed: true }];
        });

        await service.ingestForXpub("xpub-uuid");

        const rows = dbRef.current!.prepare("SELECT txid FROM transactions").all();
        expect(rows).toEqual([{ txid: "tx-1" }]);
    });
});

describe("TransactionHistoryService.execute", () => {
    it("returns the most recent persisted transactions mapped to the UI shape", async () => {
        const addressId = insertAddress("addr-uuid", "Strike", "bc1qaddr1");
        const insert = dbRef
            .current!.prepare(
                "INSERT INTO transactions (uuid, txid, address_id, xpub_address_id, amount_sat, block_time, confirmed) VALUES (?, ?, ?, NULL, ?, ?, ?)",
            );
        insert.run("u-buy", "tx-buy", addressId, 50_000, 1_700_000_000, 1);
        insert.run("u-out", "tx-out", addressId, -10_000, 1_700_100_000, 1);

        const list = await new TransactionHistoryService(10).execute();
        expect(list).toHaveLength(2);
        // Ordered by block_time DESC -> tx-out first (more recent).
        expect(list[0].id).toBe("u-out");
        expect(list[0].type).toBe("transfer");
        expect(list[0].amount).toBeCloseTo(0.0001, 8);
        expect(list[0].source).toBe("Strike");
        expect(list[1].type).toBe("buy");
    });
});

describe("TransactionHistoryService.delete*", () => {
    it("removes only the address's transactions on deleteForAddress", async () => {
        const addressId = insertAddress("addr-uuid", "Strike", "bc1qaddr1");
        dbRef
            .current!.prepare(
                "INSERT INTO transactions (uuid, txid, address_id, xpub_address_id, amount_sat, block_time, confirmed) VALUES (?, ?, ?, NULL, ?, ?, ?)",
            )
            .run("u", "tx", addressId, 1, 1, 1);

        await service.deleteForAddress("addr-uuid");
        const count = (dbRef.current!.prepare("SELECT COUNT(*) AS c FROM transactions").get() as { c: number }).c;
        expect(count).toBe(0);
    });
});
