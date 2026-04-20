import type { FiatCurrency, Denomination } from "./SettingsContext";
import { ExchangeRateRequests } from "../requests/ExchangeRateRequests";

export type Unit = "BTC" | "FIAT";

const FIAT_SYMBOLS: Record<FiatCurrency, string> = {
    USD: "$",
    EUR: "€",
    GBP: "£",
    JPY: "¥",
    CAD: "C$",
    AUD: "A$",
};

const SATS_PER_BTC = 100_000_000;

function toFiat(usdValue: number, fiat: FiatCurrency): number {
    return usdValue * ExchangeRateRequests.rateFromUsd(fiat);
}

function btcToDisplay(btc: number, denom: Denomination): number {
    return denom === "SATS" ? Math.round(btc * SATS_PER_BTC) : btc;
}

export function formatSymbol(unit: Unit, fiat: FiatCurrency = "USD", denom: Denomination = "BTC"): string {
    if (unit !== "BTC") return FIAT_SYMBOLS[fiat];
    return denom === "SATS" ? "" : "₿";
}

export function formatBtcLabel(denom: Denomination): string {
    return denom === "SATS" ? "sats" : "₿ BTC";
}

export function formatNumber(
    btc: number,
    unit: Unit,
    priceUsd: number,
    btcDigits = 8,
    fiat: FiatCurrency = "USD",
    denom: Denomination = "BTC",
): string {
    if (unit === "BTC") {
        if (denom === "SATS") {
            return btcToDisplay(btc, denom).toLocaleString();
        }
        return btc.toFixed(btcDigits);
    }
    const value = toFiat(btc * priceUsd, fiat);
    return value.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

export function formatAmount(
    btc: number,
    unit: Unit,
    priceUsd: number,
    opts: { btcDigits?: number; fiat?: FiatCurrency; denom?: Denomination } = {},
): string {
    const fiat = opts.fiat ?? "USD";
    const denom = opts.denom ?? "BTC";
    const sym = formatSymbol(unit, fiat, denom);
    const num = formatNumber(btc, unit, priceUsd, opts.btcDigits, fiat, denom);
    const suffix = unit === "BTC" && denom === "SATS" ? " sats" : "";
    return `${sym}${num}${suffix}`;
}

export function formatSecondary(
    btc: number,
    unit: Unit,
    priceUsd: number,
    fiat: FiatCurrency = "USD",
    denom: Denomination = "BTC",
): string {
    const other: Unit = unit === "BTC" ? "FIAT" : "BTC";
    return formatAmount(btc, other, priceUsd, { btcDigits: 8, fiat, denom });
}

export function formatAxis(btc: number, unit: Unit, priceUsd: number, fiat: FiatCurrency = "USD", denom: Denomination = "BTC"): string {
    if (unit === "BTC") {
        if (denom === "SATS") {
            const sats = btcToDisplay(btc, denom);
            if (sats >= 1_000_000) return `${(sats / 1_000_000).toFixed(1)}M`;
            if (sats >= 1_000) return `${(sats / 1_000).toFixed(0)}k`;
            return sats.toLocaleString();
        }
        return btc.toFixed(2);
    }
    const value = toFiat(btc * priceUsd, fiat);
    if (value >= 1_000) return `${FIAT_SYMBOLS[fiat]}${(value / 1_000).toFixed(0)}k`;
    return `${FIAT_SYMBOLS[fiat]}${value.toFixed(0)}`;
}
