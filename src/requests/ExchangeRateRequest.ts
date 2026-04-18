import type { FiatCurrency } from "../lib/SettingsContext";

/** Approximate exchange rates: 1 USD → X units of target currency. */
const RATES_FROM_USD: Record<FiatCurrency, number> = {
  USD: 1,
  EUR: 0.88,
  GBP: 0.75,
  JPY: 149.5,
  CAD: 1.38,
  AUD: 1.53,
};

export class ExchangeRateRequest {
  async execute(): Promise<Record<FiatCurrency, number>> {
    // TODO: fetch real rates from an API
    return { ...RATES_FROM_USD };
  }

  /** Synchronous accessor for mock data – useful in pure formatting helpers. */
  static rateFromUsd(currency: FiatCurrency): number {
    return RATES_FROM_USD[currency];
  }
}

