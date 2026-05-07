import { PortfolioHistoryRequests } from "../requests/PortfolioHistoryRequests";
import type { CostBasis } from "./model/CostBasis";
import type { HistoryPoint } from "./model/HistoryPoint";

/**
 * Derives cost basis and average acquisition price from the portfolio_value
 * snapshot series. Inflows are valued at the snapshot's implied spot price
 * (usd / btc); outflows reduce the basis pro-rata at the running weighted-avg
 * cost. There is no separate transactions table with explicit per-buy prices,
 * so this is the best approximation given the data we have.
 *
 * Important design assumption: an on-chain receive looks identical to a
 * "purchase" here. If a user moves BTC into a tracked address from their own
 * cold storage, the algorithm will value that inflow at the receive date's
 * spot price, not the date the user originally acquired the coins. As a
 * result, avgPrice trends toward "current spot" when most inflows are recent,
 * even though the user may have acquired the coins much earlier at much lower
 * prices. The fix on the user's side is to track the cold-storage address too
 * so its earlier inflow at the historical price is the one that counts.
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
