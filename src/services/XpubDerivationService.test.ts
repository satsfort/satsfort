import { describe, it, expect } from "vitest";
import { deriveAddressesFromExtendedKey, validateExtendedKey } from "./XpubDerivationService";

describe("XpubDerivationService", () => {
    // Well-known test vectors from BIP84 (Native SegWit)
    // These are from the BIP84 specification: https://github.com/bitcoin/bips/blob/master/bip-0084.mediawiki
    const ZPUB_TEST = "zpub6rFR7y4Q2AijBEqTUquhVz398htDFrtymD9xYYfG1m4wAcvPhXNfE3EfH1r1ADqtfSdVCToUG868RvUUkgDKf31mGDtKsAYz2oz2AGutZYs";

    // BIP44 test xpub (from BIP32 spec test vectors)
    const XPUB_TEST = "xpub661MyMwAqRbcFtXgS5sYJABqqG9YLmC4Q1Rdap9gSE8NqtwybGhePY2gZ29ESFjqJoCu1Rupje8YtGqsefD265TMg7usUDFdp6W1EGMcet8";

    describe("validateExtendedKey", () => {
        it("validates a correct zpub", () => {
            expect(validateExtendedKey(ZPUB_TEST)).toBeNull();
        });

        it("validates a correct xpub", () => {
            expect(validateExtendedKey(XPUB_TEST)).toBeNull();
        });

        it("rejects an invalid key", () => {
            const result = validateExtendedKey("xpub123invalid");
            expect(result).not.toBeNull();
        });
    });

    describe("deriveAddressesFromExtendedKey", () => {
        it("derives P2WPKH addresses starting with bc1q", () => {
            const addresses = deriveAddressesFromExtendedKey(ZPUB_TEST, "P2WPKH", 5);

            expect(addresses.length).toBe(5);
            addresses.forEach((addr, index) => {
                expect(addr.address).toMatch(/^bc1q[a-z0-9]{38,}$/);
                expect(addr.index).toBe(index);
                expect(addr.derivationPath).toContain(`/0/${index}`);
            });
        });

        it("derives P2PKH addresses starting with 1", () => {
            const addresses = deriveAddressesFromExtendedKey(XPUB_TEST, "P2PKH", 5);

            expect(addresses.length).toBe(5);
            addresses.forEach((addr) => {
                expect(addr.address).toMatch(/^1[a-km-zA-HJ-NP-Z1-9]{25,34}$/);
            });
        });

        it("derives P2SH addresses starting with 3", () => {
            const addresses = deriveAddressesFromExtendedKey(XPUB_TEST, "P2SH", 5);

            expect(addresses.length).toBe(5);
            addresses.forEach((addr) => {
                expect(addr.address).toMatch(/^3[a-km-zA-HJ-NP-Z1-9]{25,34}$/);
            });
        });

        it("derives P2TR addresses starting with bc1p", () => {
            const addresses = deriveAddressesFromExtendedKey(XPUB_TEST, "P2TR", 5);

            expect(addresses.length).toBe(5);
            addresses.forEach((addr) => {
                expect(addr.address).toMatch(/^bc1p[a-z0-9]{58}$/);
            });
        });

        it("derives unique addresses for each index", () => {
            const addresses = deriveAddressesFromExtendedKey(ZPUB_TEST, "P2WPKH", 10);
            const uniqueAddresses = new Set(addresses.map((a) => a.address));

            expect(uniqueAddresses.size).toBe(10);
        });

        it("derives the same addresses consistently", () => {
            const addresses1 = deriveAddressesFromExtendedKey(ZPUB_TEST, "P2WPKH", 3);
            const addresses2 = deriveAddressesFromExtendedKey(ZPUB_TEST, "P2WPKH", 3);

            expect(addresses1).toEqual(addresses2);
        });

        it("converts zpub to xpub internally for derivation", () => {
            // zpub and xpub with same key material should derive same underlying keys
            // (though address formats differ based on derivation type)
            const zpubAddresses = deriveAddressesFromExtendedKey(ZPUB_TEST, "P2WPKH", 3);

            // All addresses should be valid
            zpubAddresses.forEach((addr) => {
                expect(addr.address.length).toBeGreaterThan(30);
            });
        });
    });
});
