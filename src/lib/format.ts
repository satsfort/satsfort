export type Unit = "BTC" | "USD";

export function formatSymbol(unit: Unit): string {
  return unit === "BTC" ? "₿" : "$";
}

export function formatNumber(
  btc: number,
  unit: Unit,
  priceUsd: number,
  btcDigits = 8
): string {
  if (unit === "BTC") return btc.toFixed(btcDigits);
  const usd = btc * priceUsd;
  return usd.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

export function formatAmount(
  btc: number,
  unit: Unit,
  priceUsd: number,
  opts: { btcDigits?: number } = {}
): string {
  return `${formatSymbol(unit)}${formatNumber(btc, unit, priceUsd, opts.btcDigits)}`;
}

export function formatSecondary(
  btc: number,
  unit: Unit,
  priceUsd: number
): string {
  const other: Unit = unit === "BTC" ? "USD" : "BTC";
  return formatAmount(btc, other, priceUsd, { btcDigits: 8 });
}

export function formatAxis(btc: number, unit: Unit, priceUsd: number): string {
  if (unit === "BTC") return btc.toFixed(2);
  const usd = btc * priceUsd;
  if (usd >= 1_000) return `$${(usd / 1_000).toFixed(0)}k`;
  return `$${usd.toFixed(0)}`;
}
