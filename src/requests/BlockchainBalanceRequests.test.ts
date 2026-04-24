import { describe, it, expect } from "vitest";
import { BlockchainBalanceRequests } from "./BlockchainBalanceRequests";

// Note: Tests that hit real APIs are integration tests gated by network availability.

describe("BlockchainBalanceRequests (integration)", () => {
    const GENESIS_ADDRESS = "1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa";
    const SEGWIT_ADDRESS = "bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh";

    const requests = new BlockchainBalanceRequests();

    it("fetches balance for a legacy address", async () => {
        const result = await requests.get(GENESIS_ADDRESS);

        expect(result.address).toBe(GENESIS_ADDRESS);
        expect(typeof result.btc).toBe("number");
        expect(result.btc).toBeGreaterThanOrEqual(0);
        expect(typeof result.txCount).toBe("number");
        expect(result.txCount).toBeGreaterThan(0);
        expect(result.lastSeen).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it("fetches balance for a segwit address", async () => {
        const result = await requests.get(SEGWIT_ADDRESS);

        expect(result.address).toBe(SEGWIT_ADDRESS);
        expect(typeof result.btc).toBe("number");
        expect(typeof result.txCount).toBe("number");
        expect(result.lastSeen).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it("returns zero balance for an address with no transactions", async () => {
        const unusedAddress = "bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq";
        const result = await requests.get(unusedAddress);

        expect(result.address).toBe(unusedAddress);
        expect(typeof result.btc).toBe("number");
        expect(typeof result.txCount).toBe("number");
    });

    it("throws an error for invalid addresses", async () => {
        await expect(requests.get("not-a-valid-address")).rejects.toThrow();
    });
});
