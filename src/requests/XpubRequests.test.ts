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

import { XpubRequests } from "./XpubRequests";

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

const xpubRequests = new XpubRequests();

async function seedXpub(label = "Wallet", xpub = "zpub-" + crypto.randomUUID()) {
    return xpubRequests.insertXpub({
        uuid: crypto.randomUUID(),
        label,
        xpub,
        derivationType: "P2WPKH",
        addressCount: 0,
    });
}

describe("XpubRequests.getAll", () => {
    it("returns an empty array when no xpubs exist", async () => {
        expect(await xpubRequests.getAll()).toEqual([]);
    });

    it("returns all inserted xpubs ordered by id", async () => {
        await seedXpub("First");
        await seedXpub("Second");

        const all = await xpubRequests.getAll();
        expect(all.map((x) => x.label)).toEqual(["First", "Second"]);
    });
});

describe("XpubRequests.findByXpub", () => {
    it("returns null when no match", async () => {
        expect(await xpubRequests.findByXpub("zpub-missing")).toBeNull();
    });

    it("returns the inserted xpub", async () => {
        const meta = await seedXpub("Hello", "zpub-known");
        const found = await xpubRequests.findByXpub("zpub-known");
        expect(found?.id).toBe(meta.id);
    });
});

describe("XpubRequests.findInternalIdByUuid", () => {
    it("returns the internal id after insert", async () => {
        const meta = await seedXpub();
        const id = await xpubRequests.findInternalIdByUuid(meta.id);
        expect(typeof id).toBe("number");
    });

    it("returns null for an unknown uuid", async () => {
        expect(await xpubRequests.findInternalIdByUuid("00000000-0000-0000-0000-000000000000")).toBeNull();
    });
});

describe("XpubRequests.insertDerivedAddress + getDerivedAddresses", () => {
    it("persists a derived address and returns it by xpub uuid", async () => {
        const meta = await seedXpub();
        const internalId = (await xpubRequests.findInternalIdByUuid(meta.id))!;

        const derived = await xpubRequests.insertDerivedAddress(internalId, {
            uuid: crypto.randomUUID(),
            xpubUuid: meta.id,
            address: "bc1qxpubaddr",
            derivationPath: "m/0/0",
            index: 0,
        });

        expect(derived.address).toBe("bc1qxpubaddr");

        const all = await xpubRequests.getDerivedAddresses(meta.id);
        expect(all).toHaveLength(1);
        expect(all[0].address).toBe("bc1qxpubaddr");
        expect(all[0].xpubId).toBe(meta.id);
    });
});

describe("XpubRequests.getAllDerivedAddresses", () => {
    it("returns derived addresses across all xpubs", async () => {
        const a = await seedXpub("A");
        const b = await seedXpub("B");
        const aId = (await xpubRequests.findInternalIdByUuid(a.id))!;
        const bId = (await xpubRequests.findInternalIdByUuid(b.id))!;

        await xpubRequests.insertDerivedAddress(aId, {
            uuid: crypto.randomUUID(),
            xpubUuid: a.id,
            address: "bc1qa0",
            derivationPath: "m/0/0",
            index: 0,
        });
        await xpubRequests.insertDerivedAddress(bId, {
            uuid: crypto.randomUUID(),
            xpubUuid: b.id,
            address: "bc1qb0",
            derivationPath: "m/0/0",
            index: 0,
        });

        const all = await xpubRequests.getAllDerivedAddresses();
        expect(all.map((d) => d.address).sort()).toEqual(["bc1qa0", "bc1qb0"]);
    });
});

describe("XpubRequests.remove", () => {
    it("deletes the xpub and its derived addresses", async () => {
        const meta = await seedXpub();
        const internalId = (await xpubRequests.findInternalIdByUuid(meta.id))!;
        await xpubRequests.insertDerivedAddress(internalId, {
            uuid: crypto.randomUUID(),
            xpubUuid: meta.id,
            address: "bc1qwill-go",
            derivationPath: "m/0/0",
            index: 0,
        });

        await xpubRequests.remove(meta.id);

        expect(await xpubRequests.getAll()).toHaveLength(0);
        expect(await xpubRequests.getDerivedAddresses(meta.id)).toHaveLength(0);
    });
});

describe("XpubRequests.sumDerivedBalances", () => {
    it("sums latest balances across derived addresses, treating nulls as zero", async () => {
        const meta = await seedXpub();
        const internalId = (await xpubRequests.findInternalIdByUuid(meta.id))!;
        await xpubRequests.insertDerivedAddress(internalId, {
            uuid: crypto.randomUUID(),
            xpubUuid: meta.id,
            address: "bc1q0",
            derivationPath: "m/0/0",
            index: 0,
        });
        await xpubRequests.insertDerivedAddress(internalId, {
            uuid: crypto.randomUUID(),
            xpubUuid: meta.id,
            address: "bc1q1",
            derivationPath: "m/0/1",
            index: 1,
        });

        dbRef
            .current!.prepare(
                "UPDATE xpub_addresses SET latest_balance_btc = ?, latest_balance_usd = ?, latest_tx_count = ? WHERE address_index = 0",
            )
            .run(0.2, 20_000, 2);

        const totals = await xpubRequests.sumDerivedBalances(internalId);
        expect(totals.btc).toBeCloseTo(0.2, 8);
        expect(totals.usd).toBeCloseTo(20_000, 4);
        expect(totals.txCount).toBe(2);
    });
});

describe("XpubRequests.updateLatestBalance + insertBalanceSnapshot", () => {
    const sample = { btc: 0.4, usd: 40_000, txCount: 5, fetchedAt: "2026-04-20T08:00:00.000Z" };

    it("updates the xpubs row and appends to xpub_balances", async () => {
        const meta = await seedXpub();
        const internalId = (await xpubRequests.findInternalIdByUuid(meta.id))!;

        await xpubRequests.updateLatestBalance(internalId, sample);
        await xpubRequests.insertBalanceSnapshot(internalId, sample);

        const row = dbRef
            .current!.prepare("SELECT latest_balance_btc, latest_balance_usd, latest_tx_count FROM xpubs WHERE id = ?")
            .get(internalId) as { latest_balance_btc: number; latest_balance_usd: number; latest_tx_count: number };
        expect(row.latest_balance_btc).toBeCloseTo(0.4, 8);
        expect(row.latest_balance_usd).toBeCloseTo(40_000, 4);
        expect(row.latest_tx_count).toBe(5);

        const snaps = dbRef.current!.prepare("SELECT balance_btc FROM xpub_balances WHERE xpub_id = ?").all(internalId) as {
            balance_btc: number;
        }[];
        expect(snaps).toHaveLength(1);
        expect(snaps[0].balance_btc).toBeCloseTo(0.4, 8);
    });
});
