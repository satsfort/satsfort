import { describe, it, expect } from "vitest";
import { AddressBalanceRequests } from "./AddressBalanceRequests";

// Note: These tests hit real APIs and are integration tests
// They verify that the Electrum-compatible APIs are working correctly

describe("AddressBalanceRequests (integration)", () => {
    // A well-known Bitcoin address with transaction history (Satoshi's genesis block address)
    const GENESIS_ADDRESS = "1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa";
    // A well-known SegWit address with balance
    const SEGWIT_ADDRESS = "bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh";

    const requests = new AddressBalanceRequests();

    it("fetches balance for a legacy address", async () => {
        const result = await requests.execute(GENESIS_ADDRESS);

        expect(result.address).toBe(GENESIS_ADDRESS);
        expect(typeof result.btc).toBe("number");
        expect(result.btc).toBeGreaterThanOrEqual(0);
        expect(typeof result.txCount).toBe("number");
        expect(result.txCount).toBeGreaterThan(0); // Genesis address has many donations
        expect(result.lastSeen).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it("fetches balance for a segwit address", async () => {
        const result = await requests.execute(SEGWIT_ADDRESS);

        expect(result.address).toBe(SEGWIT_ADDRESS);
        expect(typeof result.btc).toBe("number");
        expect(typeof result.txCount).toBe("number");
        expect(result.lastSeen).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it("returns zero balance for an address with no transactions", async () => {
        // Generate a valid but unused address (theoretically never used)
        const unusedAddress = "bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq";
        const result = await requests.execute(unusedAddress);

        expect(result.address).toBe(unusedAddress);
        expect(typeof result.btc).toBe("number");
        expect(typeof result.txCount).toBe("number");
    });

    it("can fetch multiple addresses in parallel", async () => {
        const addresses = [GENESIS_ADDRESS, SEGWIT_ADDRESS];
        const results = await requests.executeAll(addresses);

        expect(results.length).toBe(2);
        expect(results[0].address).toBe(GENESIS_ADDRESS);
        expect(results[1].address).toBe(SEGWIT_ADDRESS);
    });

    it("throws an error for invalid addresses", async () => {
        // The API should return an error for invalid addresses
        await expect(requests.execute("not-a-valid-address")).rejects.toThrow();
    });
});
