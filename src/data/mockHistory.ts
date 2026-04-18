export type HistoryPoint = {
  date: string;
  btc: number;
};

export type Transaction = {
  id: string;
  date: string;
  type: "buy" | "transfer";
  amount: number;
  source: string;
};

const TARGET_BTC = 2.1;
const WEEKS = 104;
const END_DATE = new Date("2026-04-18T00:00:00Z");

export function generateHistory(): HistoryPoint[] {
  const raw: HistoryPoint[] = [];
  let btc = 0;

  for (let i = 0; i <= WEEKS; i++) {
    const d = new Date(END_DATE);
    d.setUTCDate(END_DATE.getUTCDate() - (WEEKS - i) * 7);

    if (i > 0) {
      const dca = TARGET_BTC / WEEKS;
      const wobble = (Math.sin(i * 1.73) + Math.cos(i * 0.91)) * 0.006;
      const stack = i % 14 === 0 ? 0.045 : 0;
      btc += Math.max(0, dca + wobble + stack);
    }

    raw.push({
      date: d.toISOString().slice(0, 10),
      btc,
    });
  }

  const scale = TARGET_BTC / raw[raw.length - 1].btc;
  return raw.map((p) => ({
    date: p.date,
    btc: Math.round(p.btc * scale * 1e8) / 1e8,
  }));
}

export function recentTransactions(history: HistoryPoint[]): Transaction[] {
  const sources = ["Coldcard", "Jade", "Strike", "Kraken", "River"];
  const out: Transaction[] = [];
  for (let i = history.length - 1; i > 0 && out.length < 6; i--) {
    const delta = history[i].btc - history[i - 1].btc;
    if (delta <= 0) continue;
    out.push({
      id: `tx-${i}`,
      date: history[i].date,
      type: delta > 0.04 ? "transfer" : "buy",
      amount: Math.round(delta * 1e8) / 1e8,
      source: sources[i % sources.length],
    });
  }
  return out;
}

export const BTC_PRICE_USD = 94_820;
