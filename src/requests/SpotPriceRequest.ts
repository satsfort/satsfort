export type SpotPrice = {
  usd: number;
  source: string;
  asOf: string;
};

export class SpotPriceRequest {
  async execute(): Promise<SpotPrice> {
    return {
      usd: 94_820,
      source: "mock",
      asOf: new Date().toISOString(),
    };
  }
}
