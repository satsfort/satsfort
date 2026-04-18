import { Config } from "../lib/Config";

export type SpotPrice = {
  usd: number;
  source: string;
  asOf: string;
};

export class SpotPriceRequests {
  async execute(): Promise<SpotPrice> {
    if (!Config.useMockData) {
      // TODO: fetch real spot price from exchange API
      return { usd: 0, source: "none", asOf: new Date().toISOString() };
    }
    return {
      usd: 94_820,
      source: "mock",
      asOf: new Date().toISOString(),
    };
  }
}
