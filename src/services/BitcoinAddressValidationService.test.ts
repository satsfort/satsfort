import { describe, it, expect } from "vitest";
import { validateBitcoinAddress } from "./BitcoinAddressValidationService";

describe("validateBitcoinAddress", () => {
    describe("valid addresses", () => {
        const validAddresses = [
            // Segwit P2WPKH (v0, 20-byte program)
            "bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4",
            // Taproot (v1, bech32m)
            "bc1p0xlxvlhemja6c4dqv22uapctqupfhlxm9h8z3k2e72q4k9hcz7vqzk5jj0",
            // Legacy P2PKH
            "1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa",
            "1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2",
            // P2SH
            "3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy",
        ];

        for (const addr of validAddresses) {
            it(`accepts ${addr.slice(0, 12)}...`, async () => {
                expect(await validateBitcoinAddress(addr)).toBeNull();
            });
        }
    });

    describe("invalid addresses", () => {
        const invalidCases: [string, string][] = [
            ["", "Address is required"],
            ["   ", "Address is required"],
            ["hello world", "Address must start with bc1, 1, or 3"],
            ["0x742d35Cc6634C0532925a3b844Bc9e7595f2bD", "Address must start with bc1, 1, or 3"],
            // Wrong checksum (last char changed)
            ["bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t5", "Invalid Bech32 checksum"],
            // Mixed case bech32
            ["bc1qW508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4", "must not mix upper and lower"],
            // Testnet address
            ["tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx", "Address must start with bc1, 1, or 3"],
            // Too short legacy
            ["1A1zP1", "Base58 address must be 25–34"],
            // Invalid base58 char (O is not in base58)
            ["1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfOa", "Invalid Base58 character"],
            // Wrong checksum legacy (last char changed)
            ["1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNb", "Invalid Base58Check checksum"],
            // Invalid bech32 character
            ["bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kb8f3t4", "Invalid Bech32 character"],
        ];

        for (const [addr, expectedSubstring] of invalidCases) {
            it(`rejects "${addr.slice(0, 20)}..." — ${expectedSubstring}`, async () => {
                const result = await validateBitcoinAddress(addr);
                expect(result).not.toBeNull();
                expect(result).toContain(expectedSubstring);
            });
        }
    });
});
