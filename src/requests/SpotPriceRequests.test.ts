import { describe, it, expect, beforeAll } from "vitest";
import { SpotPriceRequests } from "./SpotPriceRequests";
import { Config } from "../lib/Config";

// Force real API calls
(Config as { useMockData: boolean }).useMockData = false;

describe("SpotPriceRequests (integration)", () => {
    let spot: { usd: number; source: string; asOf: string };

    beforeAll(async () => {
        spot = await new SpotPriceRequests().execute();
    }, 15_000);

    it("returns a positive USD price", () => {
        expect(spot.usd).toBeGreaterThan(0);
    });

    it("returns a reasonable BTC price in USD (1k–10M)", () => {
        expect(spot.usd).toBeGreaterThanOrEqual(1_000);
        expect(spot.usd).toBeLessThanOrEqual(10_000_000);
    });

    it("returns a known source name", () => {
        const knownSources = ["coingecko", "coinbase", "kraken", "blockchain.info"];
        expect(knownSources).toContain(spot.source);
    });

    it("returns a valid ISO timestamp in asOf", () => {
        const parsed = new Date(spot.asOf).getTime();
        expect(parsed).not.toBeNaN();
        // Should be within the last minute
        expect(Date.now() - parsed).toBeLessThan(60_000);
    });

    it("rotates source on a second call and still returns a valid price", async () => {
        const spot2 = await new SpotPriceRequests().execute();
        expect(spot2.usd).toBeGreaterThanOrEqual(1_000);
        expect(spot2.usd).toBeLessThanOrEqual(10_000_000);
        expect(spot2.source).not.toBe(spot.source);
    }, 15_000);
});
