export type HistoryPoint = {
  date: string;
  btc: number;
};

const TARGET_BTC = 2.1;
const WEEKS = 104;
const END_DATE = new Date("2026-04-18T00:00:00Z");

export class PortfolioHistoryRequest {
  async execute(): Promise<HistoryPoint[]> {
    return this.buildMock();
  }

  private buildMock(): HistoryPoint[] {
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

      raw.push({ date: d.toISOString().slice(0, 10), btc });
    }

    const scale = TARGET_BTC / raw[raw.length - 1].btc;
    return raw.map((p) => ({
      date: p.date,
      btc: Math.round(p.btc * scale * 1e8) / 1e8,
    }));
  }
}
