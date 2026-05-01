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

type RawTx = { txid: string; amountSat: number; blockTime: number | null; confirmed: boolean };
type GetForAddressOpts = {
    stopAtTxid?: string;
    onPageFetched?: (info: { pages: number; txsSoFar: number; pageTxs: RawTx[] }) => Promise<void> | void;
};

const blockchainGetForAddress = vi.hoisted(() => vi.fn());

/**
 * Mocks one call to `BlockchainTransactionsRequests.getForAddress`. The
 * service persists once at end-of-pagination from the returned array; the
 * `onPageFetched` invocation here only drives the progress-callback tests.
 */
function mockBlockchainOnce(txs: RawTx[]) {
    blockchainGetForAddress.mockImplementationOnce(async (_address: string, opts: GetForAddressOpts = {}) => {
        if (opts.onPageFetched && txs.length > 0) {
            await opts.onPageFetched({ pages: 1, txsSoFar: txs.length, pageTxs: txs });
        }
        return txs;
    });
}

function mockBlockchainImpl(impl: (address: string) => RawTx[] | Promise<RawTx[]>) {
    blockchainGetForAddress.mockImplementation(async (address: string, opts: GetForAddressOpts = {}) => {
        const txs = await impl(address);
        if (opts.onPageFetched && txs.length > 0) {
            await opts.onPageFetched({ pages: 1, txsSoFar: txs.length, pageTxs: txs });
        }
        return txs;
    });
}

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
        mockBlockchainOnce([
            { txid: "tx1", amountSat: 100_000, blockTime: 1_700_000_000, confirmed: true },
            { txid: "tx2", amountSat: -25_000, blockTime: 1_700_500_000, confirmed: true },
        ]);

        await service.ingestForAddress("addr-uuid", "bc1qaddr1");

        expect(blockchainGetForAddress).toHaveBeenCalledWith("bc1qaddr1", expect.objectContaining({ stopAtTxid: undefined }));
        const rows = dbRef.current!.prepare("SELECT txid, amount_sat FROM address_transactions ORDER BY id").all();
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
            "INSERT INTO address_transactions (uuid, txid, address_id, amount_sat, block_time, confirmed) VALUES (?, ?, ?, ?, ?, ?)",
        );
        // Older confirmed tx, newer confirmed tx, plus a pending one with no
        // block_time. The marker should be the newest CONFIRMED tx.
        insert.run("u-old", "tx-old", addressId, 1, 1_700_000_000, 1);
        insert.run("u-new", "tx-new", addressId, 1, 1_700_500_000, 1);
        insert.run("u-pending", "tx-pending", addressId, 1, null, 0);

        mockBlockchainOnce([]);

        await service.ingestForAddress("addr-uuid", "bc1qaddr1", { incremental: true });

        expect(blockchainGetForAddress).toHaveBeenCalledWith("bc1qaddr1", expect.objectContaining({ stopAtTxid: "tx-new" }));
    });

    it("falls through to a full fetch on incremental mode when the address has no transactions yet", async () => {
        // Address row exists but no transactions yet — empty wallet edge case.
        insertAddress("addr-uuid", "Empty", "bc1qempty");
        mockBlockchainOnce([]);

        await service.ingestForAddress("addr-uuid", "bc1qempty", { incremental: true });

        expect(blockchainGetForAddress).toHaveBeenCalledWith("bc1qempty", expect.objectContaining({ stopAtTxid: undefined }));
    });

    it("promotes a previously pending tx to confirmed when re-ingested through the service", async () => {
        insertAddress("addr-uuid", "Cold storage", "bc1qaddr1");

        // First ingest: tx is in mempool.
        mockBlockchainOnce([{ txid: "tx-pending", amountSat: 75_000, blockTime: null, confirmed: false }]);
        await service.ingestForAddress("addr-uuid", "bc1qaddr1");

        const before = dbRef
            .current!.prepare("SELECT block_time, confirmed FROM address_transactions WHERE txid = ?")
            .get("tx-pending") as { block_time: number | null; confirmed: number };
        expect(before).toEqual({ block_time: null, confirmed: 0 });

        // Second ingest (e.g. on refresh): same txid now confirmed in a block.
        mockBlockchainOnce([{ txid: "tx-pending", amountSat: 75_000, blockTime: 1_700_000_000, confirmed: true }]);
        await service.ingestForAddress("addr-uuid", "bc1qaddr1");

        const count = (dbRef.current!.prepare("SELECT COUNT(*) AS c FROM address_transactions").get() as { c: number }).c;
        expect(count).toBe(1);
        const after = dbRef
            .current!.prepare("SELECT block_time, confirmed FROM address_transactions WHERE txid = ?")
            .get("tx-pending") as { block_time: number | null; confirmed: number };
        expect(after).toEqual({ block_time: 1_700_000_000, confirmed: 1 });
    });

    it("falls through to a full fetch on incremental when only pending (unconfirmed) txs exist", async () => {
        const addressId = insertAddress("addr-uuid", "Mempool only", "bc1qmempool");
        dbRef
            .current!.prepare(
                "INSERT INTO address_transactions (uuid, txid, address_id, amount_sat, block_time, confirmed) VALUES (?, ?, ?, ?, ?, ?)",
            )
            .run("u-pend", "tx-pend", addressId, 1, null, 0);

        mockBlockchainOnce([]);

        await service.ingestForAddress("addr-uuid", "bc1qmempool", { incremental: true });

        expect(blockchainGetForAddress).toHaveBeenCalledWith("bc1qmempool", expect.objectContaining({ stopAtTxid: undefined }));
    });

    it("invokes onProgress with running counts as pages arrive", async () => {
        insertAddress("addr-uuid", "Multi-page", "bc1qmulti");

        blockchainGetForAddress.mockImplementationOnce(async (_addr: string, opts: GetForAddressOpts = {}) => {
            // Simulate two pages so we can observe progress callbacks ordered.
            const page1 = [{ txid: "tx-a", amountSat: 1, blockTime: 1, confirmed: true }];
            const page2 = [{ txid: "tx-b", amountSat: 2, blockTime: 2, confirmed: true }];
            await opts.onPageFetched?.({ pages: 1, txsSoFar: 1, pageTxs: page1 });
            await opts.onPageFetched?.({ pages: 2, txsSoFar: 2, pageTxs: page2 });
            return [...page1, ...page2];
        });

        const progress: { pages: number; txsSoFar: number }[] = [];
        await service.ingestForAddress("addr-uuid", "bc1qmulti", {
            onProgress: (info) => progress.push(info),
        });

        expect(progress).toEqual([
            { pages: 1, txsSoFar: 1 },
            { pages: 2, txsSoFar: 2 },
        ]);
        // Both pages persisted at the end (single atomic batch).
        const rows = dbRef.current!.prepare("SELECT txid FROM address_transactions ORDER BY id").all();
        expect(rows).toEqual([{ txid: "tx-a" }, { txid: "tx-b" }]);
    });

    it("does not persist anything when the blockchain fetch throws partway through", async () => {
        insertAddress("addr-uuid", "Half-fetched", "bc1qhalf");

        blockchainGetForAddress.mockImplementationOnce(async (_addr: string, opts: GetForAddressOpts = {}) => {
            // Page 1 succeeds and progress is reported, but the overall fetch
            // throws before page 2 completes.
            await opts.onPageFetched?.({
                pages: 1,
                txsSoFar: 1,
                pageTxs: [{ txid: "tx-page1", amountSat: 1, blockTime: 1, confirmed: true }],
            });
            throw new Error("network blew up");
        });

        await expect(service.ingestForAddress("addr-uuid", "bc1qhalf")).rejects.toThrow(/network blew up/);

        // Nothing committed — the failure happened before the end-of-sync
        // upsert, so the stopAtTxid marker on the next incremental refresh
        // is still null and we'll re-fetch the page-1 tx safely.
        const count = (dbRef.current!.prepare("SELECT COUNT(*) AS c FROM address_transactions").get() as { c: number }).c;
        expect(count).toBe(0);
    });

    it("stamps historic_transactions_fetched_at after persisting transactions", async () => {
        const addressId = insertAddress("addr-uuid", "Cold storage", "bc1qaddr1");

        const before = (
            dbRef
                .current!.prepare("SELECT historic_transactions_fetched_at AS v FROM addresses WHERE id = ?")
                .get(addressId) as { v: string | null }
        ).v;
        expect(before).toBeNull();

        mockBlockchainOnce([{ txid: "tx1", amountSat: 10, blockTime: 1, confirmed: true }]);
        await service.ingestForAddress("addr-uuid", "bc1qaddr1");

        const after = (
            dbRef
                .current!.prepare("SELECT historic_transactions_fetched_at AS v FROM addresses WHERE id = ?")
                .get(addressId) as { v: string | null }
        ).v;
        expect(after).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
    });

    it("leaves historic_transactions_fetched_at NULL when the fetch returned no transactions", async () => {
        const addressId = insertAddress("addr-uuid", "Empty", "bc1qempty");

        mockBlockchainOnce([]);
        await service.ingestForAddress("addr-uuid", "bc1qempty");

        const v = (
            dbRef
                .current!.prepare("SELECT historic_transactions_fetched_at AS v FROM addresses WHERE id = ?")
                .get(addressId) as { v: string | null }
        ).v;
        expect(v).toBeNull();
    });

    it("does not stamp historic_transactions_fetched_at when the fetch errors before completion", async () => {
        const addressId = insertAddress("addr-uuid", "Half", "bc1qhalfaddr");

        blockchainGetForAddress.mockImplementationOnce(async (_addr: string, opts: GetForAddressOpts = {}) => {
            await opts.onPageFetched?.({
                pages: 1,
                txsSoFar: 1,
                pageTxs: [{ txid: "tx-page1", amountSat: 1, blockTime: 1, confirmed: true }],
            });
            throw new Error("boom");
        });

        await expect(service.ingestForAddress("addr-uuid", "bc1qhalfaddr")).rejects.toThrow(/boom/);

        const v = (
            dbRef
                .current!.prepare("SELECT historic_transactions_fetched_at AS v FROM addresses WHERE id = ?")
                .get(addressId) as { v: string | null }
        ).v;
        expect(v).toBeNull();
    });

    it("does not persist anything when the fetch throws after page 2 (incremental refresh case)", async () => {
        const addressId = insertAddress("addr-uuid", "Existing", "bc1qexisting");
        // Pretend we already have the older history: tx-known is the marker.
        dbRef
            .current!.prepare(
                "INSERT INTO address_transactions (uuid, txid, address_id, amount_sat, block_time, confirmed) VALUES (?, ?, ?, ?, ?, ?)",
            )
            .run("u-known", "tx-known", addressId, 1, 1_700_000_000, 1);

        blockchainGetForAddress.mockImplementationOnce(async (_addr: string, opts: GetForAddressOpts = {}) => {
            await opts.onPageFetched?.({
                pages: 1,
                txsSoFar: 25,
                pageTxs: Array.from({ length: 25 }, (_, i) => ({
                    txid: `tx-new-${i}`,
                    amountSat: 1,
                    blockTime: 1_701_000_000 + i,
                    confirmed: true,
                })),
            });
            throw new Error("rate limited on page 2");
        });

        await expect(
            service.ingestForAddress("addr-uuid", "bc1qexisting", { incremental: true }),
        ).rejects.toThrow(/rate limited/);

        // The existing tx-known is still the only row — we did not commit any
        // page-1 txs, so a subsequent refresh will still use tx-known as the
        // stop marker and find every new tx (including those that were on
        // page 2 between page-1 and tx-known).
        const rows = dbRef.current!.prepare("SELECT txid FROM address_transactions").all();
        expect(rows).toEqual([{ txid: "tx-known" }]);
    });
});

describe("TransactionHistoryService.ingestForXpub", () => {
    it("fetches each derived address in parallel and persists the txs", async () => {
        const xpubId = insertXpub("xpub-uuid", "Hot wallet");
        insertXpubAddress(xpubId, "bc1qderived0", 0);
        insertXpubAddress(xpubId, "bc1qderived1", 1);

        mockBlockchainImpl((addr) => {
            if (addr === "bc1qderived0") {
                return [{ txid: "tx-0", amountSat: 10_000, blockTime: 1, confirmed: true }];
            }
            return [{ txid: "tx-1", amountSat: 20_000, blockTime: 2, confirmed: true }];
        });

        await service.ingestForXpub("xpub-uuid");

        const count = (dbRef.current!.prepare("SELECT COUNT(*) AS c FROM xpub_address_transactions").get() as { c: number }).c;
        expect(count).toBe(2);
    });

    it("continues ingesting for other derived addresses when one fetch fails", async () => {
        const xpubId = insertXpub("xpub-uuid", "Hot wallet");
        insertXpubAddress(xpubId, "bc1qderived0", 0);
        insertXpubAddress(xpubId, "bc1qderived1", 1);

        blockchainGetForAddress.mockImplementation(async (addr: string, opts: GetForAddressOpts = {}) => {
            if (addr === "bc1qderived0") throw new Error("rate limited");
            const txs: RawTx[] = [{ txid: "tx-1", amountSat: 20_000, blockTime: 2, confirmed: true }];
            if (opts.onPageFetched) await opts.onPageFetched({ pages: 1, txsSoFar: 1, pageTxs: txs });
            return txs;
        });

        await service.ingestForXpub("xpub-uuid");

        const rows = dbRef.current!.prepare("SELECT txid FROM xpub_address_transactions").all();
        expect(rows).toEqual([{ txid: "tx-1" }]);
    });

    it("stamps historic_transactions_fetched_at on each derived address that produced transactions", async () => {
        const xpubId = insertXpub("xpub-uuid", "Hot wallet");
        insertXpubAddress(xpubId, "bc1qderived0", 0);
        insertXpubAddress(xpubId, "bc1qderived1", 1);

        mockBlockchainImpl((addr) => {
            if (addr === "bc1qderived0") {
                return [{ txid: "tx-0", amountSat: 1, blockTime: 1, confirmed: true }];
            }
            return []; // derived1 has no history
        });

        await service.ingestForXpub("xpub-uuid");

        const rows = dbRef
            .current!.prepare("SELECT address, historic_transactions_fetched_at AS v FROM xpub_addresses ORDER BY address_index")
            .all() as { address: string; v: string | null }[];
        // derived0 had a tx → stamped. derived1 had nothing → still NULL.
        expect(rows[0].address).toBe("bc1qderived0");
        expect(rows[0].v).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
        expect(rows[1]).toEqual({ address: "bc1qderived1", v: null });
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
                "INSERT INTO xpub_address_transactions (uuid, txid, xpub_address_id, amount_sat, block_time, confirmed) VALUES (?, ?, ?, ?, ?, ?)",
            )
            .run("u-existing", "tx-known-0", xpubAddr0Id, 1, 1_700_000_000, 1);

        mockBlockchainImpl(() => []);

        await service.ingestForXpub("xpub-uuid", { incremental: true });

        const calls = blockchainGetForAddress.mock.calls as [string, GetForAddressOpts][];
        const byAddr = Object.fromEntries(calls.map(([addr, opts]) => [addr, opts]));
        expect(byAddr["bc1qderived0"]).toMatchObject({ stopAtTxid: "tx-known-0" });
        expect(byAddr["bc1qderived1"]).toMatchObject({ stopAtTxid: undefined });
    });
});

describe("TransactionHistoryService.execute", () => {
    it("returns the most recent persisted transactions mapped to the UI shape", async () => {
        const addressId = insertAddress("addr-uuid", "Strike", "bc1qaddr1");
        const insert = dbRef
            .current!.prepare(
                "INSERT INTO address_transactions (uuid, txid, address_id, amount_sat, block_time, confirmed) VALUES (?, ?, ?, ?, ?, ?)",
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
                "INSERT INTO address_transactions (uuid, txid, address_id, amount_sat, block_time, confirmed) VALUES (?, ?, ?, ?, ?, ?)",
            )
            .run("u", "tx", addressId, 1, 1, 1);

        await service.deleteForAddress("addr-uuid");
        const count = (dbRef.current!.prepare("SELECT COUNT(*) AS c FROM address_transactions").get() as { c: number }).c;
        expect(count).toBe(0);
    });
});
