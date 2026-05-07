import { describe, it, expect } from "vitest";
import { CostBasisService } from "./CostBasisService";
import type { HistoryPoint } from "./model/HistoryPoint";

function point(date: string, btc: number, usd: number): HistoryPoint {
    return { date, btc, usd };
}

const service = new CostBasisService();

describe("CostBasisService.compute", () => {
    it("returns zeroes for an empty history", () => {
        const result = service.compute([]);
        expect(result).toEqual({ costBasis: 0, avgPrice: 0, btcHeld: 0 });
    });

    it("returns zeroes for a baseline-only history with no holdings", () => {
        const result = service.compute([point("2026-01-01", 0, 0)]);
        expect(result.costBasis).toBe(0);
        expect(result.avgPrice).toBe(0);
        expect(result.btcHeld).toBe(0);
    });

    it("treats a single non-zero starting snapshot as an inflow at its implied price", () => {
        // 1 BTC at $50,000 spot when first observed -> cost basis = $50,000
        const result = service.compute([point("2026-01-01", 1, 50_000)]);
        expect(result.costBasis).toBeCloseTo(50_000, 4);
        expect(result.avgPrice).toBeCloseTo(50_000, 4);
        expect(result.btcHeld).toBeCloseTo(1, 8);
    });

    it("computes a weighted average across multiple inflows at different prices", () => {
        // +0.5 @ $40k, then +0.5 @ $60k -> total 1 BTC, basis $50k, avg $50k
        const result = service.compute([point("2026-01-01", 0, 0), point("2026-02-01", 0.5, 20_000), point("2026-03-01", 1, 60_000)]);
        expect(result.btcHeld).toBeCloseTo(1, 8);
        expect(result.costBasis).toBeCloseTo(50_000, 4);
        expect(result.avgPrice).toBeCloseTo(50_000, 4);
    });

    it("ignores flat snapshots where btc does not change", () => {
        // Three snapshots, balance unchanged, only USD value drifts -> no inflow recorded
        const result = service.compute([
            point("2026-01-01", 0.5, 30_000),
            point("2026-01-15", 0.5, 35_000),
            point("2026-02-01", 0.5, 25_000),
        ]);
        // First snapshot is the only inflow: 0.5 BTC at $60k implied price
        expect(result.btcHeld).toBeCloseTo(0.5, 8);
        expect(result.costBasis).toBeCloseTo(30_000, 4);
        expect(result.avgPrice).toBeCloseTo(60_000, 4);
    });

    it("reduces basis pro-rata on partial outflows at the running average", () => {
        // +1 BTC @ $50k, then send out 0.4 BTC -> hold 0.6 BTC, basis 0.6 * $50k = $30k
        const result = service.compute([point("2026-01-01", 0, 0), point("2026-02-01", 1, 50_000), point("2026-03-01", 0.6, 36_000)]);
        expect(result.btcHeld).toBeCloseTo(0.6, 8);
        expect(result.costBasis).toBeCloseTo(30_000, 4);
        expect(result.avgPrice).toBeCloseTo(50_000, 4);
    });

    it("zeroes out basis on full outflow", () => {
        const result = service.compute([point("2026-01-01", 0, 0), point("2026-02-01", 1, 50_000), point("2026-03-01", 0, 0)]);
        expect(result.btcHeld).toBe(0);
        expect(result.costBasis).toBe(0);
        expect(result.avgPrice).toBe(0);
    });

    it("rebuilds basis when new inflows arrive after a full outflow", () => {
        // Buy 1 @ $50k, sell all, then buy 0.25 @ $80k -> basis $20k, avg $80k
        const result = service.compute([
            point("2026-01-01", 0, 0),
            point("2026-02-01", 1, 50_000),
            point("2026-03-01", 0, 0),
            point("2026-04-01", 0.25, 20_000),
        ]);
        expect(result.btcHeld).toBeCloseTo(0.25, 8);
        expect(result.costBasis).toBeCloseTo(20_000, 4);
        expect(result.avgPrice).toBeCloseTo(80_000, 4);
    });

    it("interleaves inflows and outflows correctly", () => {
        // +1 @ $40k -> basis 40k, avg 40k
        // +1 @ $60k -> basis 100k, avg 50k, held 2
        // -0.5 -> basis 100k - 0.5*50k = 75k, held 1.5
        // +0.5 @ $80k -> basis 75k + 40k = 115k, held 2, avg 57.5k
        const result = service.compute([
            point("2026-01-01", 0, 0),
            point("2026-02-01", 1, 40_000),
            point("2026-03-01", 2, 120_000),
            point("2026-04-01", 1.5, 90_000),
            point("2026-05-01", 2, 160_000),
        ]);
        expect(result.btcHeld).toBeCloseTo(2, 8);
        expect(result.costBasis).toBeCloseTo(115_000, 4);
        expect(result.avgPrice).toBeCloseTo(57_500, 4);
    });

    it("handles satoshi-precision deltas without losing accuracy", () => {
        // 21,000,000 sats == 0.21 BTC @ $90k -> basis 18,900
        const result = service.compute([point("2026-01-01", 0.21, 18_900)]);
        expect(result.btcHeld).toBeCloseTo(0.21, 8);
        expect(result.costBasis).toBeCloseTo(18_900, 4);
        expect(result.avgPrice).toBeCloseTo(90_000, 4);
    });

    it("caps outflow at current holdings to avoid negative state", () => {
        // Buy 0.1, then snapshot drops to a small negative-implying balance ->
        // service must clamp and never produce negative basis or holdings.
        const result = service.compute([point("2026-01-01", 0, 0), point("2026-02-01", 0.1, 5_000), point("2026-03-01", -0.05, 0)]);
        expect(result.btcHeld).toBe(0);
        expect(result.costBasis).toBe(0);
        expect(result.avgPrice).toBe(0);
    });

    it("preserves the historical avg when a fresh snapshot at current spot is appended", () => {
        // Realistic backtrack scenario: a single historical inflow at an old
        // price, then a "now" snapshot at the current spot price with the same
        // balance. The trailing snapshot must NOT inflate the avg, because no
        // BTC moved.
        const result = service.compute([
            point("2022-01-01T00:00:00Z", 0, 0),
            point("2022-06-15T00:00:00Z", 0.5, 10_000), // implied $20k/BTC
            point("2026-05-07T12:00:00Z", 0.5, 47_500), // current spot ~$95k, no inflow
        ]);
        expect(result.btcHeld).toBeCloseTo(0.5, 8);
        expect(result.costBasis).toBeCloseTo(10_000, 4);
        expect(result.avgPrice).toBeCloseTo(20_000, 4);
    });

    it("yields a high avg when every inflow lands at recent prices (design behavior, not a bug)", () => {
        // User imports an address that received all its BTC last week. There is
        // no historical record predating the inflow, so the algorithm values it
        // at the recent spot. avgPrice ~= recent spot is correct given the
        // data, even if the user actually acquired the coins years earlier.
        const result = service.compute([
            point("2026-04-01T00:00:00Z", 0, 0),
            point("2026-05-01T00:00:00Z", 0.25, 23_750), // implied $95k
            point("2026-05-07T00:00:00Z", 0.25, 23_625), // no inflow, slight price drift
        ]);
        expect(result.btcHeld).toBeCloseTo(0.25, 8);
        expect(result.avgPrice).toBeCloseTo(95_000, 4);
    });

    it("treats a snapshot with usd=0 (failed price fetch) as a zero-priced inflow without NaN", () => {
        // BacktrackService falls back to price=0 if the historical price API
        // is down. The algorithm should still finish cleanly and surface a
        // lower avg, never NaN/Infinity.
        const result = service.compute([
            point("2024-01-01T00:00:00Z", 0, 0),
            point("2024-06-01T00:00:00Z", 0.4, 0), // price fetch failed
            point("2024-12-01T00:00:00Z", 0.6, 60_000), // implied $100k, +0.2 inflow
        ]);
        expect(Number.isFinite(result.avgPrice)).toBe(true);
        expect(Number.isFinite(result.costBasis)).toBe(true);
        expect(result.btcHeld).toBeCloseTo(0.6, 8);
        expect(result.costBasis).toBeCloseTo(20_000, 4); // 0.4*$0 + 0.2*$100k
        expect(result.avgPrice).toBeCloseTo(20_000 / 0.6, 4);
    });

    it("accumulates many tiny DCA inflows without precision drift", () => {
        // 52 weekly buys of 0.01 BTC at a steadily rising price.
        const points: HistoryPoint[] = [point("2025-01-01T00:00:00Z", 0, 0)];
        let runningBtc = 0;
        let expectedBasis = 0;
        for (let week = 1; week <= 52; week++) {
            const price = 50_000 + week * 500; // $50,500 .. $76,000
            const buy = 0.01;
            runningBtc += buy;
            expectedBasis += buy * price;
            const date = new Date(`2025-01-01T00:00:00Z`);
            date.setUTCDate(date.getUTCDate() + week * 7);
            points.push(point(date.toISOString(), runningBtc, runningBtc * price));
        }
        const result = service.compute(points);
        expect(result.btcHeld).toBeCloseTo(0.52, 8);
        expect(result.costBasis).toBeCloseTo(expectedBasis, 2);
        expect(result.avgPrice).toBeCloseTo(expectedBasis / 0.52, 2);
    });

    it("re-prices later inflows at later spot prices (weighted average grows)", () => {
        // Demonstrates that when price ramps up between inflows, the weighted
        // avg lifts toward the latest inflow's price, not the first.
        const result = service.compute([
            point("2024-01-01T00:00:00Z", 0, 0),
            point("2024-02-01T00:00:00Z", 1, 30_000), // +1 @ $30k
            point("2024-08-01T00:00:00Z", 2, 120_000), // +1 @ $60k
            point("2025-02-01T00:00:00Z", 3, 270_000), // +1 @ $90k
        ]);
        expect(result.btcHeld).toBeCloseTo(3, 8);
        expect(result.costBasis).toBeCloseTo(30_000 + 60_000 + 90_000, 4);
        expect(result.avgPrice).toBeCloseTo(60_000, 4);
    });
});
