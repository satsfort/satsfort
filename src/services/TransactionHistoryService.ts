import { Config } from "../lib/Config";
import { PortfolioHistoryRequests } from "../requests/PortfolioHistoryRequests";
import type { HistoryPoint } from "./model/HistoryPoint";
import type { Transaction } from "./model/Transaction";

const SOURCES = ["Coldcard", "Jade", "Strike", "Kraken", "River"];

export class TransactionHistoryService {
    private readonly portfolioHistoryRequests = new PortfolioHistoryRequests();

    constructor(private limit: number = 6) {}

    async execute(): Promise<Transaction[]> {
        if (!Config.useMockData) return [];
        const history = await this.portfolioHistoryRequests.getAll();
        return this.buildMock(history);
    }

    private buildMock(history: HistoryPoint[]): Transaction[] {
        const out: Transaction[] = [];
        for (let i = history.length - 1; i > 0 && out.length < this.limit; i--) {
            const delta = history[i].btc - history[i - 1].btc;
            if (delta <= 0) continue;
            out.push({
                id: `tx-${i}`,
                date: history[i].date,
                type: delta > 0.04 ? "transfer" : "buy",
                amount: Math.round(delta * 1e8) / 1e8,
                source: SOURCES[i % SOURCES.length],
            });
        }
        return out;
    }
}
