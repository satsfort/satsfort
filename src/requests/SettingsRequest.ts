import type { FiatCurrency, Denomination } from "../lib/SettingsContext";

export type PriceSource = "kraken" | "bitstamp" | "coinbase" | "average";

export type SettingsData = {
  currency: FiatCurrency;
  denomination: Denomination;
  useOwnNode: boolean;
  nodeUrl: string;
  priceSource: PriceSource;
  telemetry: boolean;
  autoSync: boolean;
};

const STORAGE_KEY = "sats-fort-settings";

const DEFAULTS: SettingsData = {
  currency: "USD",
  denomination: "BTC",
  useOwnNode: false,
  nodeUrl: "http://127.0.0.1:8332",
  priceSource: "kraken",
  telemetry: false,
  autoSync: true,
};

export class LoadSettingsRequest {
  async execute(): Promise<SettingsData> {
    return LoadSettingsRequest.loadSync();
  }

  static loadSync(): SettingsData {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return { ...DEFAULTS };
      return { ...DEFAULTS, ...JSON.parse(raw) };
    } catch {
      return { ...DEFAULTS };
    }
  }
}

export class SaveSettingsRequest {
  constructor(private readonly settings: SettingsData) {}

  async execute(): Promise<void> {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(this.settings));
  }
}

