import { PortfolioHistoryRequests } from "../requests/PortfolioHistoryRequests";
import type { CostBasis } from "./model/CostBasis";
import type { HistoryPoint } from "./model/HistoryPoint";

/**
 * Derives cost basis and average acquisition price from the portfolio_value
 * snapshot series. Inflows are valued at the snapshot's implied spot price
 * (usd / btc); outflows reduce the basis pro-rata at the running weighted-avg
 * cost. There is no separate transactions table with explicit per-buy prices,
 * so this is the best approximation given the data we have.
 */
export class CostBasisService {
    private readonly portfolioHistoryRequests = new PortfolioHistoryRequests();

    async execute(): Promise<CostBasis> {
        const history = await this.portfolioHistoryRequests.getAll();
        return this.compute(history);
    }

    compute(history: HistoryPoint[]): CostBasis {
        let costBasis = 0;
        let btcHeld = 0;

        for (let i = 0; i < history.length; i++) {
            const point = history[i];
            const prevBtc = i === 0 ? 0 : history[i - 1].btc;
            const deltaBtc = point.btc - prevBtc;

            if (deltaBtc > 0) {
                const price = point.btc > 0 ? point.usd / point.btc : 0;
                costBasis += deltaBtc * price;
                btcHeld += deltaBtc;
            } else if (deltaBtc < 0 && btcHeld > 0) {
                const avgSoFar = costBasis / btcHeld;
                const outflow = Math.min(-deltaBtc, btcHeld);
                costBasis -= outflow * avgSoFar;
                btcHeld -= outflow;
                if (btcHeld <= 0) {
                    btcHeld = 0;
                    costBasis = 0;
                }
            }
        }

        const avgPrice = btcHeld > 0 ? costBasis / btcHeld : 0;
        return { costBasis, avgPrice, btcHeld };
    }
}
