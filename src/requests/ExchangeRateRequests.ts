import { Config } from "../lib/Config";
import type { FiatCurrency } from "../lib/SettingsContext";

/** Approximate exchange rates used for mock mode: 1 USD → X target. */
const MOCK_RATES: Record<FiatCurrency, number> = {
  USD: 1,
  EUR: 0.88,
  GBP: 0.75,
  JPY: 149.5,
  CAD: 1.38,
  AUD: 1.53,
};

const SUPPORTED_CURRENCIES: FiatCurrency[] = ["USD", "EUR", "GBP", "JPY", "CAD", "AUD"];

type RateFetcher = {
  name: string;
  fetch: () => Promise<Record<FiatCurrency, number>>;
};

function pickRates(data: Record<string, number>): Record<FiatCurrency, number> {
  const rates: Record<string, number> = { USD: 1 };
  for (const cur of SUPPORTED_CURRENCIES) {
    if (cur === "USD") continue;
    const val = data[cur];
    if (typeof val === "number" && val > 0) {
      rates[cur] = val;
    } else {
      rates[cur] = MOCK_RATES[cur]; // safe fallback per-currency
    }
  }
  return rates as Record<FiatCurrency, number>;
}

const RATE_SOURCES: RateFetcher[] = [
  {
    name: "frankfurter",
    fetch: async () => {
      const symbols = SUPPORTED_CURRENCIES.filter((c) => c !== "USD").join(",");
      const res = await fetch(
        `https://api.frankfurter.dev/v1/latest?base=USD&symbols=${symbols}`
      );
      if (!res.ok) throw new Error(`Frankfurter HTTP ${res.status}`);
      const data = await res.json();
      return pickRates(data.rates);
    },
  },
  {
    name: "exchangerate-api",
    fetch: async () => {
      const res = await fetch(
        "https://open.er-api.com/v6/latest/USD"
      );
      if (!res.ok) throw new Error(`ExchangeRate-API HTTP ${res.status}`);
      const data = await res.json();
      return pickRates(data.rates);
    },
  },
  {
    name: "fawazahmed0",
    fetch: async () => {
      const res = await fetch(
        "https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.json"
      );
      if (!res.ok) throw new Error(`fawazahmed0 HTTP ${res.status}`);
      const data = await res.json();
      const raw = data.usd;
      // This API returns lowercase keys
      const mapped: Record<string, number> = {};
      for (const cur of SUPPORTED_CURRENCIES) {
        if (cur === "USD") continue;
        mapped[cur] = raw[cur.toLowerCase()];
      }
      return pickRates(mapped);
    },
  },
];

let lastSourceIndex = -1;
let cachedRates: Record<FiatCurrency, number> = { ...MOCK_RATES };
let cacheLoaded = false;

export class ExchangeRateRequests {
  async execute(): Promise<Record<FiatCurrency, number>> {
    if (Config.useMockData) {
      return { ...MOCK_RATES };
    }

    const startIndex = (lastSourceIndex + 1) % RATE_SOURCES.length;

    for (let attempt = 0; attempt < RATE_SOURCES.length; attempt++) {
      const index = (startIndex + attempt) % RATE_SOURCES.length;
      const source = RATE_SOURCES[index];
      try {
        const rates = await source.fetch();
        lastSourceIndex = index;
        cachedRates = rates;
        cacheLoaded = true;
        return rates;
      } catch (error) {
        console.warn(`ExchangeRateRequests: ${source.name} failed, trying next`, error);
      }
    }

    throw new Error("ExchangeRateRequests: all exchange rate sources failed");
  }

  /** Synchronous accessor — returns cached real rates or mock fallback. */
  static rateFromUsd(currency: FiatCurrency): number {
    if (Config.useMockData) {
      return MOCK_RATES[currency];
    }
    if (!cacheLoaded) {
      // Kick off a background fetch to populate cache for next call
      void new ExchangeRateRequests().execute().catch(() => {});
      return MOCK_RATES[currency];
    }
    return cachedRates[currency];
  }
}
