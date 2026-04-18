import { useMemo } from "react";
import { PortfolioChart } from "../components/PortfolioChart";
import {
  BTC_PRICE_USD,
  generateHistory,
  recentTransactions,
} from "../data/mockHistory";
import type { Unit } from "../lib/format";
import {
  formatAmount,
  formatNumber,
  formatSecondary,
  formatSymbol,
} from "../lib/format";

type Props = {
  unit: Unit;
  setUnit: (u: Unit) => void;
};

export function PortfolioPage({ unit, setUnit }: Props) {
  const history = useMemo(() => generateHistory(), []);
  const transactions = useMemo(() => recentTransactions(history), [history]);

  const latest = history[history.length - 1];
  const yearAgo = history[history.length - 53] ?? history[0];
  const monthAgo = history[history.length - 5] ?? history[0];

  const usdValue = latest.btc * BTC_PRICE_USD;
  const costBasis = 62_400;
  const avgPrice = costBasis * 0.98;
  const invested = latest.btc * avgPrice;
  const pnl = usdValue - invested;
  const pnlPct = (pnl / invested) * 100;
  const monthDelta = latest.btc - monthAgo.btc;
  const yearDelta = latest.btc - yearAgo.btc;

  const heroNumber = formatNumber(latest.btc, unit, BTC_PRICE_USD, 8);
  const heroSecondary = formatSecondary(latest.btc, unit, BTC_PRICE_USD);

  return (
    <>
      <header className="page-head">
        <div>
          <div className="eyebrow">Dashboard</div>
          <h1 className="page-title">Portfolio</h1>
        </div>
        <div className="page-actions">
          <div className="unit-toggle" role="group" aria-label="Display unit">
            <button
              className={`unit-btn ${unit === "BTC" ? "active" : ""}`}
              onClick={() => setUnit("BTC")}
            >
              ₿ BTC
            </button>
            <button
              className={`unit-btn ${unit === "USD" ? "active" : ""}`}
              onClick={() => setUnit("USD")}
            >
              $ USD
            </button>
          </div>
          <button className="btn btn-primary">+ Add Transaction</button>
        </div>
      </header>

      <section className="hero">
        <div className="hero-main">
          <div className="eyebrow">Total Holdings</div>
          <div className="hero-value">
            <span className="tick">{formatSymbol(unit)}</span>
            {heroNumber}
          </div>
          <div className="hero-sub">
            <span className="usd">{heroSecondary}</span>
            <span className={pnl >= 0 ? "delta-pos" : "delta-neg"}>
              {pnl >= 0 ? "▲" : "▼"} ${Math.abs(pnl).toLocaleString(undefined, { maximumFractionDigits: 0 })}{" "}
              ({pnlPct.toFixed(1)}%)
            </span>
            <span className="muted">unrealized</span>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-label">30-Day Stack</div>
          <div className="stat-value">
            <span className="plus">+</span>
            {formatAmount(monthDelta, unit, BTC_PRICE_USD, { btcDigits: 4 })}
          </div>
          <div className="small muted mono">
            {formatSecondary(monthDelta, unit, BTC_PRICE_USD)}
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-label">12-Month Stack</div>
          <div className="stat-value">
            <span className="plus">+</span>
            {formatAmount(yearDelta, unit, BTC_PRICE_USD, { btcDigits: 4 })}
          </div>
          <div className="small muted mono">
            {formatSecondary(yearDelta, unit, BTC_PRICE_USD)}
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-label">Avg. Cost</div>
          <div className="stat-value">
            ${avgPrice.toLocaleString(undefined, { maximumFractionDigits: 0 })}
          </div>
          <div className="small muted mono">per BTC</div>
        </div>

        <div className="stat-card">
          <div className="stat-label">BTC Price</div>
          <div className="stat-value">
            ${BTC_PRICE_USD.toLocaleString()}
          </div>
          <div className="small muted mono">mocked spot</div>
        </div>
      </section>

      <PortfolioChart history={history} priceUsd={BTC_PRICE_USD} unit={unit} />

      <section className="section">
        <div className="section-head">
          <h2 className="section-title">// Recent Activity</h2>
          <span className="small muted mono">{transactions.length} entries</span>
        </div>
        <div className="tx-table">
          <div className="tx-row head">
            <div>Type</div>
            <div>Date</div>
            <div>Amount</div>
            <div className="tx-hide-sm">Source</div>
            <div className="tx-hide-sm">{unit === "BTC" ? "USD Value" : "BTC"}</div>
          </div>
          {transactions.map((tx) => (
            <div className="tx-row" key={tx.id}>
              <div>
                <span className={`tx-tag ${tx.type}`}>{tx.type}</span>
              </div>
              <div>{tx.date}</div>
              <div className="tx-amount">
                <span className="plus">+</span>
                {formatAmount(tx.amount, unit, BTC_PRICE_USD, { btcDigits: 6 })}
              </div>
              <div className="tx-hide-sm muted">{tx.source}</div>
              <div className="tx-hide-sm">
                {formatSecondary(tx.amount, unit, BTC_PRICE_USD)}
              </div>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
