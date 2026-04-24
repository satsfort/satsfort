import { describe, it, expect, beforeAll } from "vitest";
import { ExchangeRateRequests } from "./ExchangeRateRequests";
import { Config } from "../lib/Config";

// Force real API calls
(Config as { useMockData: boolean }).useMockData = false;

const CURRENCIES = ["USD", "EUR", "GBP", "JPY", "CAD", "AUD"] as const;

// Wide but sane ranges for 1 USD → X (should survive normal market moves)
const REASONABLE_RANGES: Record<string, { min: number; max: number }> = {
    USD: { min: 1, max: 1 },
    EUR: { min: 0.5, max: 1.5 },
    GBP: { min: 0.4, max: 1.3 },
    JPY: { min: 80, max: 300 },
    CAD: { min: 0.9, max: 2.0 },
    AUD: { min: 0.9, max: 2.5 },
};

const exchangeRateRequests = ExchangeRateRequests.getInstance();

describe("ExchangeRateRequests (integration)", () => {
    let rates: Record<string, number>;

    beforeAll(async () => {
        rates = await exchangeRateRequests.loadCache();
    }, 15_000);

    it("returns all supported currencies", () => {
        for (const cur of CURRENCIES) {
            expect(rates).toHaveProperty(cur);
        }
    });

    it("returns USD as exactly 1", () => {
        expect(rates.USD).toBe(1);
    });

    for (const cur of CURRENCIES) {
        if (cur === "USD") continue;
        it(`returns a reasonable ${cur} rate`, () => {
            const range = REASONABLE_RANGES[cur];
            expect(rates[cur]).toBeGreaterThanOrEqual(range.min);
            expect(rates[cur]).toBeLessThanOrEqual(range.max);
        });
    }

    it("rotates source on a second call and still returns valid rates", async () => {
        const rates2 = await exchangeRateRequests.loadCache();
        for (const cur of CURRENCIES) {
            const range = REASONABLE_RANGES[cur];
            expect(rates2[cur]).toBeGreaterThanOrEqual(range.min);
            expect(rates2[cur]).toBeLessThanOrEqual(range.max);
        }
    }, 15_000);

    it("populates the synchronous rateFromUsd cache", () => {
        for (const cur of CURRENCIES) {
            const rate = exchangeRateRequests.rateFromUsd(cur);
            const range = REASONABLE_RANGES[cur];
            expect(rate).toBeGreaterThanOrEqual(range.min);
            expect(rate).toBeLessThanOrEqual(range.max);
        }
    });
});
