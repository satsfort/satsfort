import type { FiatCurrency } from "./SettingsContext";
import { ExchangeRateRequest } from "../requests/ExchangeRateRequest";

export type Unit = "BTC" | "FIAT";

const FIAT_SYMBOLS: Record<FiatCurrency, string> = {
  USD: "$",
  EUR: "€",
  GBP: "£",
  JPY: "¥",
  CAD: "C$",
  AUD: "A$",
};

function toFiat(usdValue: number, fiat: FiatCurrency): number {
  return usdValue * ExchangeRateRequest.rateFromUsd(fiat);
}

export function formatSymbol(unit: Unit, fiat: FiatCurrency = "USD"): string {
  return unit === "BTC" ? "₿" : FIAT_SYMBOLS[fiat];
}

export function formatNumber(
  btc: number,
  unit: Unit,
  priceUsd: number,
  btcDigits = 8,
  fiat: FiatCurrency = "USD"
): string {
  if (unit === "BTC") return btc.toFixed(btcDigits);
  const value = toFiat(btc * priceUsd, fiat);
  const fractionDigits = fiat === "JPY" ? 0 : 0;
  return value.toLocaleString(undefined, { maximumFractionDigits: fractionDigits });
}

export function formatAmount(
  btc: number,
  unit: Unit,
  priceUsd: number,
  opts: { btcDigits?: number; fiat?: FiatCurrency } = {}
): string {
  const fiat = opts.fiat ?? "USD";
  return `${formatSymbol(unit, fiat)}${formatNumber(btc, unit, priceUsd, opts.btcDigits, fiat)}`;
}

export function formatSecondary(
  btc: number,
  unit: Unit,
  priceUsd: number,
  fiat: FiatCurrency = "USD"
): string {
  const other: Unit = unit === "BTC" ? "FIAT" : "BTC";
  return formatAmount(btc, other, priceUsd, { btcDigits: 8, fiat });
}

export function formatAxis(btc: number, unit: Unit, priceUsd: number, fiat: FiatCurrency = "USD"): string {
  if (unit === "BTC") return btc.toFixed(2);
  const value = toFiat(btc * priceUsd, fiat);
  if (value >= 1_000) return `${FIAT_SYMBOLS[fiat]}${(value / 1_000).toFixed(0)}k`;
  return `${FIAT_SYMBOLS[fiat]}${value.toFixed(0)}`;
}
