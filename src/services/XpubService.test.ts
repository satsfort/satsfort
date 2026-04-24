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

import { XpubService } from "./XpubService";

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

const service = new XpubService();

describe("XpubService.validateXpub", () => {
    describe("valid xpubs", () => {
        it("accepts a valid zpub", () => {
            const zpub = "zpub6rFR7y4Q2AijBEqTUquhVz398htDFrtymD9xYYfG1m4wAcvPhXNfE3EfH1r1ADqtfSdVCToUG868RvUUkgDKf31mGDtKsAYz2oz2AGutZYs";
            expect(service.validateXpub(zpub)).toBeNull();
        });

        it("accepts a valid xpub", () => {
            const xpub = "xpub661MyMwAqRbcFtXgS5sYJABqqG9YLmC4Q1Rdap9gSE8NqtwybGhePY2gZ29ESFjqJoCu1Rupje8YtGqsefD265TMg7usUDFdp6W1EGMcet8";
            expect(service.validateXpub(xpub)).toBeNull();
        });

        it("accepts a valid ypub", () => {
            const ypub = "ypub6Ww3ibxVfGzLrAH1PNcjyAWenMTbbAosGNB6VvmSEgytSER9azLDWCxoJwW7Ke7icmizBMXrzBx9979FfaHxHcrArf3zbeJJJUZPf663zsP";
            expect(service.validateXpub(ypub)).toBeNull();
        });
    });

    describe("invalid xpubs", () => {
        it("rejects empty string", () => {
            expect(service.validateXpub("")).toBe("Extended public key is required");
        });

        it("rejects whitespace-only string", () => {
            expect(service.validateXpub("   ")).toBe("Extended public key is required");
        });

        it("rejects invalid prefix", () => {
            expect(service.validateXpub("invalid123456789")).toContain("must start with");
        });

        it("rejects testnet keys", () => {
            const tpub = "tpub661MyMwAqRbcFtXgS5sYJABqqG9YLmC4Q1Rdap9gSE8NqtwybGhePY2gZ29ESFjqJoCu1Rupje8YtGqsefD265TMg7usUDFdp6W1EGMcet8";
            expect(service.validateXpub(tpub)).toContain("Testnet");
        });

        it("rejects keys that are too short", () => {
            expect(service.validateXpub("zpub6rFR7y4Q2Aij")).toContain("invalid length");
        });

        it("rejects keys with invalid characters", () => {
            const invalidXpub =
                "zpub6rFR7y4Q2AijBEqTUquhVz398htDFrtymD9xYYfG1m4wAcvPhXNfE3EfH1r1ADqtfSdVCToUG868RvUUkgDKf31mGDtKsAYz2oz2AGOI0LO";
            expect(service.validateXpub(invalidXpub)).toContain("Invalid character");
        });
    });
});

describe("XpubService.getDefaultDerivationType", () => {
    it("returns P2WPKH for zpub", () => {
        expect(service.getDefaultDerivationType("zpub6rFR7y4Q2Aij...")).toBe("P2WPKH");
    });

    it("returns P2SH for ypub", () => {
        expect(service.getDefaultDerivationType("ypub6Ww3ibxVfGzL...")).toBe("P2SH");
    });

    it("returns P2PKH for xpub", () => {
        expect(service.getDefaultDerivationType("xpub661MyMwAqRbc...")).toBe("P2PKH");
    });
});

describe("XpubService.add", () => {
    it("can add and retrieve an xpub", async () => {
        const xpub = "zpub6rFR7y4Q2AijBEqTUquhVz398htDFrtymD9xYYfG1m4wAcvPhXNfE3EfH1r1ADqtfSdVCToUG868RvUUkgDKf31mGDtKsAYz2oz2AGutZYs";
        const result = await service.add(xpub, "Test Wallet", "P2WPKH");

        expect(result.xpub.label).toBe("Test Wallet");
        expect(result.xpub.xpub).toBe(xpub);
        expect(result.xpub.derivationType).toBe("P2WPKH");
        expect(result.addresses.length).toBe(20);

        const all = await service.getAll();
        expect(all).toHaveLength(1);
        expect(all[0].id).toBe(result.xpub.id);
    });

    it("derives addresses with correct properties", async () => {
        const xpub = "xpub661MyMwAqRbcFtXgS5sYJABqqG9YLmC4Q1Rdap9gSE8NqtwybGhePY2gZ29ESFjqJoCu1Rupje8YtGqsefD265TMg7usUDFdp6W1EGMcet8";
        const result = await service.add(xpub, "Legacy Wallet", "P2PKH");

        const firstAddress = result.addresses[0];
        expect(firstAddress.xpubId).toBe(result.xpub.id);
        expect(firstAddress.index).toBe(0);
        expect(firstAddress.derivationPath).toContain("m/44'/0'/0'/0/0");
        expect(firstAddress.address.startsWith("1")).toBe(true);
    });

    it("persists derived addresses and returns them via getDerivedAddresses", async () => {
        const xpub = "zpub6rFR7y4Q2AijBEqTUquhVz398htDFrtymD9xYYfG1m4wAcvPhXNfE3EfH1r1ADqtfSdVCToUG868RvUUkgDKf31mGDtKsAYz2oz2AGutZYs";
        const result = await service.add(xpub, "Native SegWit", "P2WPKH");

        const derived = await service.getDerivedAddresses(result.xpub.id);
        expect(derived).toHaveLength(20);
        expect(derived[0].xpubId).toBe(result.xpub.id);
        expect(derived.map((d) => d.index)).toEqual([...Array(20).keys()]);
    });

    it("throws error for duplicate xpub", async () => {
        const xpub = "zpub6rFR7y4Q2AijBEqTUquhVz398htDFrtymD9xYYfG1m4wAcvPhXNfE3EfH1r1ADqtfSdVCToUG868RvUUkgDKf31mGDtKsAYz2oz2AGutZYs";
        await service.add(xpub, "Original Wallet", "P2WPKH");
        await expect(service.add(xpub, "Duplicate Wallet", "P2WPKH")).rejects.toThrow("already being tracked");
    });

    it("throws error when label is blank", async () => {
        const xpub = "zpub6rFR7y4Q2AijBEqTUquhVz398htDFrtymD9xYYfG1m4wAcvPhXNfE3EfH1r1ADqtfSdVCToUG868RvUUkgDKf31mGDtKsAYz2oz2AGutZYs";
        await expect(service.add(xpub, "   ", "P2WPKH")).rejects.toThrow("Label is required");
    });
});

describe("XpubService.remove", () => {
    it("removes the xpub and its derived addresses", async () => {
        const xpub = "ypub6Ww3ibxVfGzLrAH1PNcjyAWenMTbbAosGNB6VvmSEgytSER9azLDWCxoJwW7Ke7icmizBMXrzBx9979FfaHxHcrArf3zbeJJJUZPf663zsP";
        const result = await service.add(xpub, "Wrapped Wallet", "P2SH");

        await service.remove(result.xpub.id);

        const derivedAfter = await service.getDerivedAddresses(result.xpub.id);
        expect(derivedAfter.length).toBe(0);

        const all = await service.getAll();
        expect(all).toHaveLength(0);
    });
});

describe("XpubService.saveBalance", () => {
    it("aggregates derived address balances and snapshots to xpub_balances", async () => {
        const xpub = "zpub6rFR7y4Q2AijBEqTUquhVz398htDFrtymD9xYYfG1m4wAcvPhXNfE3EfH1r1ADqtfSdVCToUG868RvUUkgDKf31mGDtKsAYz2oz2AGutZYs";
        const result = await service.add(xpub, "Aggregation Wallet", "P2WPKH");

        const db = dbRef.current!;
        db.prepare(
            "UPDATE xpub_addresses SET latest_balance_btc = ?, latest_balance_usd = ?, latest_tx_count = ? WHERE address_index IN (0, 1)",
        ).run(0.5, 50_000, 3);
        db.prepare(
            "UPDATE xpub_addresses SET latest_balance_btc = ?, latest_balance_usd = ?, latest_tx_count = ? WHERE address_index = 2",
        ).run(0.25, 25_000, 1);

        const totals = await service.saveBalance(result.xpub.id);
        expect(totals.btc).toBeCloseTo(1.25, 8);
        expect(totals.usd).toBeCloseTo(125_000, 4);
        expect(totals.txCount).toBe(7);

        const xpubRow = db
            .prepare("SELECT latest_balance_btc, latest_balance_usd, latest_tx_count FROM xpubs WHERE uuid = ?")
            .get(result.xpub.id) as {
            latest_balance_btc: number;
            latest_balance_usd: number;
            latest_tx_count: number;
        };
        expect(xpubRow.latest_balance_btc).toBeCloseTo(1.25, 8);
        expect(xpubRow.latest_balance_usd).toBeCloseTo(125_000, 4);
        expect(xpubRow.latest_tx_count).toBe(7);

        const snapshots = db.prepare("SELECT balance_btc, balance_usd, tx_count FROM xpub_balances").all() as {
            balance_btc: number;
            balance_usd: number;
            tx_count: number;
        }[];
        expect(snapshots).toHaveLength(1);
        expect(snapshots[0].balance_btc).toBeCloseTo(1.25, 8);
        expect(snapshots[0].balance_usd).toBeCloseTo(125_000, 4);
        expect(snapshots[0].tx_count).toBe(7);
    });

    it("throws when the xpub is unknown", async () => {
        await expect(service.saveBalance("00000000-0000-0000-0000-000000000000")).rejects.toThrow("xpub not found");
    });
});
