import { describe, it, expect, vi, beforeEach } from "vitest";

type DbRow = Record<string, unknown>;

const xpubRows: DbRow[] = [];
const xpubAddressRows: DbRow[] = [];

vi.mock("../db", () => ({
    dbExecute: vi.fn(async (query: string, values: unknown[] = []) => {
        if (query.startsWith("INSERT INTO xpubs")) {
            const [uuid, label, xpub, derivation_type, address_count] = values as [string, string, string, string, number];
            xpubRows.push({
                uuid,
                label,
                xpub,
                derivation_type,
                address_count,
                created_at: new Date().toISOString().replace("T", " ").slice(0, 19),
            });
            return 1;
        }
        if (query.startsWith("INSERT INTO xpub_addresses")) {
            const [uuid, xpub_uuid, address, derivation_path, address_index] = values as [string, string, string, string, number];
            xpubAddressRows.push({ uuid, xpub_uuid, address, derivation_path, address_index });
            return 1;
        }
        if (query.startsWith("DELETE FROM xpub_addresses")) {
            const [xpub_uuid] = values as [string];
            for (let i = xpubAddressRows.length - 1; i >= 0; i--) {
                if (xpubAddressRows[i].xpub_uuid === xpub_uuid) xpubAddressRows.splice(i, 1);
            }
            return 1;
        }
        if (query.startsWith("DELETE FROM xpubs")) {
            const [uuid] = values as [string];
            const index = xpubRows.findIndex((row) => row.uuid === uuid);
            if (index !== -1) xpubRows.splice(index, 1);
            return 1;
        }
        return 0;
    }),
    dbSelect: vi.fn(async (query: string, values: unknown[] = []) => {
        if (query.includes("FROM xpubs WHERE xpub = ?")) {
            const [xpub] = values as [string];
            return xpubRows.filter((row) => row.xpub === xpub);
        }
        if (query.includes("FROM xpubs WHERE uuid = ?")) {
            const [uuid] = values as [string];
            return xpubRows.filter((row) => row.uuid === uuid);
        }
        if (query.includes("FROM xpubs")) {
            return [...xpubRows];
        }
        if (query.includes("FROM xpub_addresses WHERE xpub_uuid = ?")) {
            const [xpub_uuid] = values as [string];
            return xpubAddressRows
                .filter((row) => row.xpub_uuid === xpub_uuid)
                .sort((a, b) => (a.address_index as number) - (b.address_index as number));
        }
        if (query.includes("FROM xpub_addresses")) {
            return [...xpubAddressRows];
        }
        return [];
    }),
}));

import { validateXpub, getDefaultDerivationType, XpubRequests } from "./XpubRequests";

beforeEach(() => {
    xpubRows.length = 0;
    xpubAddressRows.length = 0;
});

describe("validateXpub", () => {
    describe("valid xpubs", () => {
        it("accepts a valid zpub", () => {
            const zpub = "zpub6rFR7y4Q2AijBEqTUquhVz398htDFrtymD9xYYfG1m4wAcvPhXNfE3EfH1r1ADqtfSdVCToUG868RvUUkgDKf31mGDtKsAYz2oz2AGutZYs";
            expect(validateXpub(zpub)).toBeNull();
        });

        it("accepts a valid xpub", () => {
            const xpub = "xpub661MyMwAqRbcFtXgS5sYJABqqG9YLmC4Q1Rdap9gSE8NqtwybGhePY2gZ29ESFjqJoCu1Rupje8YtGqsefD265TMg7usUDFdp6W1EGMcet8";
            expect(validateXpub(xpub)).toBeNull();
        });

        it("accepts a valid ypub", () => {
            const ypub = "ypub6Ww3ibxVfGzLrAH1PNcjyAWenMTbbAosGNB6VvmSEgytSER9azLDWCxoJwW7Ke7icmizBMXrzBx9979FfaHxHcrArf3zbeJJJUZPf663zsP";
            expect(validateXpub(ypub)).toBeNull();
        });
    });

    describe("invalid xpubs", () => {
        it("rejects empty string", () => {
            expect(validateXpub("")).toBe("Extended public key is required");
        });

        it("rejects whitespace-only string", () => {
            expect(validateXpub("   ")).toBe("Extended public key is required");
        });

        it("rejects invalid prefix", () => {
            expect(validateXpub("invalid123456789")).toContain("must start with");
        });

        it("rejects testnet keys", () => {
            const tpub = "tpub661MyMwAqRbcFtXgS5sYJABqqG9YLmC4Q1Rdap9gSE8NqtwybGhePY2gZ29ESFjqJoCu1Rupje8YtGqsefD265TMg7usUDFdp6W1EGMcet8";
            expect(validateXpub(tpub)).toContain("Testnet");
        });

        it("rejects keys that are too short", () => {
            expect(validateXpub("zpub6rFR7y4Q2Aij")).toContain("invalid length");
        });

        it("rejects keys with invalid characters", () => {
            const invalidXpub =
                "zpub6rFR7y4Q2AijBEqTUquhVz398htDFrtymD9xYYfG1m4wAcvPhXNfE3EfH1r1ADqtfSdVCToUG868RvUUkgDKf31mGDtKsAYz2oz2AGOI0LO";
            expect(validateXpub(invalidXpub)).toContain("Invalid character");
        });
    });
});

describe("getDefaultDerivationType", () => {
    it("returns P2WPKH for zpub", () => {
        expect(getDefaultDerivationType("zpub6rFR7y4Q2Aij...")).toBe("P2WPKH");
    });

    it("returns P2SH for ypub", () => {
        expect(getDefaultDerivationType("ypub6Ww3ibxVfGzL...")).toBe("P2SH");
    });

    it("returns P2PKH for xpub", () => {
        expect(getDefaultDerivationType("xpub661MyMwAqRbc...")).toBe("P2PKH");
    });
});

describe("XpubRequests", () => {
    const requests = new XpubRequests();

    it("can add and retrieve an xpub", async () => {
        const xpub = "zpub6rFR7y4Q2AijBEqTUquhVz398htDFrtymD9xYYfG1m4wAcvPhXNfE3EfH1r1ADqtfSdVCToUG868RvUUkgDKf31mGDtKsAYz2oz2AGutZYs";
        const result = await requests.add(xpub, "Test Wallet", "P2WPKH");

        expect(result.xpub.label).toBe("Test Wallet");
        expect(result.xpub.xpub).toBe(xpub);
        expect(result.xpub.derivationType).toBe("P2WPKH");
        expect(result.addresses.length).toBe(20);
    });

    it("derives addresses with correct properties", async () => {
        const xpub = "xpub661MyMwAqRbcFtXgS5sYJABqqG9YLmC4Q1Rdap9gSE8NqtwybGhePY2gZ29ESFjqJoCu1Rupje8YtGqsefD265TMg7usUDFdp6W1EGMcet8";
        const result = await requests.add(xpub, "Legacy Wallet", "P2PKH");

        const firstAddress = result.addresses[0];
        expect(firstAddress.xpubId).toBe(result.xpub.id);
        expect(firstAddress.index).toBe(0);
        expect(firstAddress.derivationPath).toContain("m/44'/0'/0'/0/0");
        expect(firstAddress.address.startsWith("1")).toBe(true);
    });

    it("can remove an xpub and its derived addresses", async () => {
        const xpub = "ypub6Ww3ibxVfGzLrAH1PNcjyAWenMTbbAosGNB6VvmSEgytSER9azLDWCxoJwW7Ke7icmizBMXrzBx9979FfaHxHcrArf3zbeJJJUZPf663zsP";
        const result = await requests.add(xpub, "Wrapped Wallet", "P2SH");

        await requests.remove(result.xpub.id);

        const derivedAfterRemoval = await requests.getDerivedAddresses(result.xpub.id);
        expect(derivedAfterRemoval.length).toBe(0);
    });

    it("throws error for duplicate xpub", async () => {
        const xpub = "zpub6rFR7y4Q2AijBEqTUquhVz398htDFrtymD9xYYfG1m4wAcvPhXNfE3EfH1r1ADqtfSdVCToUG868RvUUkgDKf31mGDtKsAYz2oz2AGutZYs";
        await requests.add(xpub, "Original Wallet", "P2WPKH");
        await expect(requests.add(xpub, "Duplicate Wallet", "P2WPKH")).rejects.toThrow("already being tracked");
    });
});
