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

        expect(blockchainGetForAddress).toHaveBeenCalledWith("bc1qaddr1", { stopAtTxid: undefined });
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

    it("passes the latest confirmed txid as the stop marker when incremental", async () => {
        const addressId = insertAddress("addr-uuid", "Cold storage", "bc1qaddr1");
        const insert = dbRef.current!.prepare(
            "INSERT INTO transactions (uuid, txid, address_id, xpub_address_id, amount_sat, block_time, confirmed) VALUES (?, ?, ?, NULL, ?, ?, ?)",
        );
        // Older confirmed tx, newer confirmed tx, plus a pending one with no
        // block_time. The marker should be the newest CONFIRMED tx.
        insert.run("u-old", "tx-old", addressId, 1, 1_700_000_000, 1);
        insert.run("u-new", "tx-new", addressId, 1, 1_700_500_000, 1);
        insert.run("u-pending", "tx-pending", addressId, 1, null, 0);

        blockchainGetForAddress.mockResolvedValueOnce([]);

        await service.ingestForAddress("addr-uuid", "bc1qaddr1", { incremental: true });

        expect(blockchainGetForAddress).toHaveBeenCalledWith("bc1qaddr1", { stopAtTxid: "tx-new" });
    });

    it("falls through to a full fetch on incremental mode when the address has no transactions yet", async () => {
        // Address row exists but no transactions yet — empty wallet edge case.
        insertAddress("addr-uuid", "Empty", "bc1qempty");
        blockchainGetForAddress.mockResolvedValueOnce([]);

        await service.ingestForAddress("addr-uuid", "bc1qempty", { incremental: true });

        expect(blockchainGetForAddress).toHaveBeenCalledWith("bc1qempty", { stopAtTxid: undefined });
    });

    it("promotes a previously pending tx to confirmed when re-ingested through the service", async () => {
        insertAddress("addr-uuid", "Cold storage", "bc1qaddr1");

        // First ingest: tx is in mempool.
        blockchainGetForAddress.mockResolvedValueOnce([
            { txid: "tx-pending", amountSat: 75_000, blockTime: null, confirmed: false },
        ]);
        await service.ingestForAddress("addr-uuid", "bc1qaddr1");

        const before = dbRef
            .current!.prepare("SELECT block_time, confirmed FROM transactions WHERE txid = ?")
            .get("tx-pending") as { block_time: number | null; confirmed: number };
        expect(before).toEqual({ block_time: null, confirmed: 0 });

        // Second ingest (e.g. on refresh): same txid now confirmed in a block.
        blockchainGetForAddress.mockResolvedValueOnce([
            { txid: "tx-pending", amountSat: 75_000, blockTime: 1_700_000_000, confirmed: true },
        ]);
        await service.ingestForAddress("addr-uuid", "bc1qaddr1");

        const count = (dbRef.current!.prepare("SELECT COUNT(*) AS c FROM transactions").get() as { c: number }).c;
        expect(count).toBe(1);
        const after = dbRef
            .current!.prepare("SELECT block_time, confirmed FROM transactions WHERE txid = ?")
            .get("tx-pending") as { block_time: number | null; confirmed: number };
        expect(after).toEqual({ block_time: 1_700_000_000, confirmed: 1 });
    });

    it("falls through to a full fetch on incremental when only pending (unconfirmed) txs exist", async () => {
        const addressId = insertAddress("addr-uuid", "Mempool only", "bc1qmempool");
        dbRef
            .current!.prepare(
                "INSERT INTO transactions (uuid, txid, address_id, xpub_address_id, amount_sat, block_time, confirmed) VALUES (?, ?, ?, NULL, ?, ?, ?)",
            )
            .run("u-pend", "tx-pend", addressId, 1, null, 0);

        blockchainGetForAddress.mockResolvedValueOnce([]);

        await service.ingestForAddress("addr-uuid", "bc1qmempool", { incremental: true });

        expect(blockchainGetForAddress).toHaveBeenCalledWith("bc1qmempool", { stopAtTxid: undefined });
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

    it("on incremental refresh, passes a per-derived-address stop marker (or undefined for empty derived addresses)", async () => {
        const xpubId = insertXpub("xpub-uuid", "Hot wallet");
        insertXpubAddress(xpubId, "bc1qderived0", 0);
        insertXpubAddress(xpubId, "bc1qderived1", 1);

        // Seed only derived0 with a confirmed tx; derived1 stays empty.
        const xpubAddr0Id = (
            dbRef
                .current!.prepare("SELECT id FROM xpub_addresses WHERE address = ?")
                .get("bc1qderived0") as { id: number }
        ).id;
        dbRef
            .current!.prepare(
                "INSERT INTO transactions (uuid, txid, address_id, xpub_address_id, amount_sat, block_time, confirmed) VALUES (?, ?, NULL, ?, ?, ?, ?)",
            )
            .run("u-existing", "tx-known-0", xpubAddr0Id, 1, 1_700_000_000, 1);

        blockchainGetForAddress.mockResolvedValue([]);

        await service.ingestForXpub("xpub-uuid", { incremental: true });

        const calls = blockchainGetForAddress.mock.calls as [string, { stopAtTxid?: string }][];
        const byAddr = Object.fromEntries(calls.map(([addr, opts]) => [addr, opts]));
        expect(byAddr["bc1qderived0"]).toEqual({ stopAtTxid: "tx-known-0" });
        expect(byAddr["bc1qderived1"]).toEqual({ stopAtTxid: undefined });
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
