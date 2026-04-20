import { useEffect, useState } from "react";
import "./PortfolioPage.css";
import "./BalancePrivacy.css";
import { PortfolioChart } from "../components/PortfolioChart";
import { EyeIcon, EyeOffIcon, BarChartIcon } from "../components/icons";
import { EmptyState } from "../components/EmptyState";
import { PortfolioHistoryRequests } from "../requests/PortfolioHistoryRequests";
import type { HistoryPoint } from "../requests/PortfolioHistoryRequests";
import { TransactionHistoryService } from "../services/TransactionHistoryService";
import type { Transaction } from "../services/TransactionHistoryService";
import { SpotPriceRequests } from "../requests/SpotPriceRequests";
import type { SpotPrice } from "../requests/SpotPriceRequests";
import type { Unit } from "../lib/format";
import { formatAmount, formatBtcLabel, formatNumber, formatSecondary, formatSymbol } from "../lib/format";
import { useSettings } from "../lib/SettingsContext";
import { ExchangeRateRequests } from "../requests/ExchangeRateRequests";
import { LoadingIndicator } from "../components/LoadingIndicator";
import { useTaskNotifications } from "../lib/TaskNotificationsContext";
import { dbExecute, dbSelect } from "../db";

type HoldingRow = {
    id: number;
    amount_btc: number;
    purchase_price: number | null;
    purchase_date: string | null;
    notes: string | null;
    created_at: string;
};

type Props = {
    unit: Unit;
    setUnit: (u: Unit) => void;
    balancesHidden: boolean;
    onToggleBalances: () => void;
};

export function PortfolioPage({ unit, setUnit, balancesHidden, onToggleBalances }: Props) {
    const [history, setHistory] = useState<HistoryPoint[] | null>(null);
    const [transactions, setTransactions] = useState<Transaction[] | null>(null);
    const [spot, setSpot] = useState<SpotPrice | null>(null);
    const { currency, denomination } = useSettings();
    const { track } = useTaskNotifications();
    const [holdings, setHoldings] = useState<HoldingRow[]>([]);
    const [holdingsError, setHoldingsError] = useState<string | null>(null);

    useEffect(() => {
        // TEMP: artificial delay to preview loading state
        const timer = setTimeout(() => {
            new PortfolioHistoryRequests().execute().then(setHistory);
            new TransactionHistoryService().execute().then(setTransactions);
            track("Spot price", () => new SpotPriceRequests().execute())
                .then(setSpot)
                .catch((err) => {
                    console.error("Failed to fetch spot price", err);
                    setSpot({ usd: 0, source: "unavailable", asOf: new Date().toISOString() });
                });
            track("Exchange rates", () => new ExchangeRateRequests().execute()).catch(() => {});
        }, 2000);
        return () => clearTimeout(timer);
    }, [track]);

    useEffect(() => {
        const upsertAndLoadHoldings = async () => {
            setHoldingsError(null);

            try {
                const existing = await dbSelect<{ total: number }>("SELECT COUNT(*) AS total FROM holdings WHERE notes = $1", ["DCA buy"]);

                if ((existing[0]?.total ?? 0) === 0) {
                    await dbExecute(
                        "INSERT INTO holdings (uuid, amount_btc, purchase_price, purchase_date, notes) VALUES ($1, $2, $3, $4, $5)",
                        [crypto.randomUUID(), 0.5, 64000, "2025-01-15", "DCA buy"],
                    );
                }

                const rows = await dbSelect<HoldingRow>(
                    "SELECT id, amount_btc, purchase_price, purchase_date, notes, created_at FROM holdings ORDER BY created_at DESC",
                );
                setHoldings(rows);
                console.log("Encrypted holdings", rows);
            } catch (error) {
                console.error("Failed to run holdings query example", error);
                setHoldingsError("Failed to load local encrypted holdings.");
            }
        };

        void upsertAndLoadHoldings();
    }, []);

    if (history === null || transactions === null || !spot) {
        return (
            <>
                <header className="page-head">
                    <div>
                        <div className="eyebrow">Dashboard</div>
                        <h1 className="page-title">Portfolio</h1>
                    </div>
                </header>
                <LoadingIndicator />
            </>
        );
    }

    if (history.length === 0) {
        return (
            <>
                <header className="page-head">
                    <div>
                        <div className="eyebrow">Dashboard</div>
                        <h1 className="page-title">Portfolio</h1>
                    </div>
                    <div className="page-actions">
                        <button className="btn btn-primary">+ Add Transaction</button>
                    </div>
                </header>
                <EmptyState
                    icon={<BarChartIcon size={56} />}
                    title="No portfolio data yet"
                    description="Add a transaction or import an address to start tracking your stack."
                    action={<button className="btn btn-primary">+ Add Transaction</button>}
                />
            </>
        );
    }

    const priceUsd = spot.usd;
    const latest = history[history.length - 1];
    const yearAgo = history[history.length - 53] ?? history[0];
    const monthAgo = history[history.length - 5] ?? history[0];

    const rate = ExchangeRateRequests.rateFromUsd(currency);
    const fiatSymbol = formatSymbol("FIAT", currency);

    const usdValue = latest.btc * priceUsd;
    const costBasis = 62_400;
    const avgPrice = costBasis * 0.98;
    const invested = latest.btc * avgPrice;
    const pnl = usdValue - invested;
    const pnlPct = (pnl / invested) * 100;
    const monthDelta = latest.btc - monthAgo.btc;
    const yearDelta = latest.btc - yearAgo.btc;

    const heroNumber = formatNumber(latest.btc, unit, priceUsd, 8, currency, denomination);
    const heroSecondary = formatSecondary(latest.btc, unit, priceUsd, currency, denomination);

    return (
        <div className={balancesHidden ? "balances-hidden" : undefined}>
            <header className="page-head">
                <div>
                    <div className="eyebrow">Dashboard</div>
                    <h1 className="page-title">Portfolio</h1>
                </div>
                <div className="page-actions">
                    <button
                        className="btn btn-icon"
                        onClick={onToggleBalances}
                        aria-pressed={balancesHidden}
                        aria-label={balancesHidden ? "Show balances" : "Hide balances"}
                        title={balancesHidden ? "Show balances" : "Hide balances"}
                    >
                        {balancesHidden ? <EyeIcon /> : <EyeOffIcon />}
                    </button>
                    <div className="unit-toggle" role="group" aria-label="Display unit">
                        <button className={`unit-btn ${unit === "BTC" ? "active" : ""}`} onClick={() => setUnit("BTC")}>
                            {formatBtcLabel(denomination)}
                        </button>
                        <button className={`unit-btn ${unit === "FIAT" ? "active" : ""}`} onClick={() => setUnit("FIAT")}>
                            {formatSymbol("FIAT", currency)} {currency}
                        </button>
                    </div>
                    <button className="btn btn-primary">+ Add Transaction</button>
                </div>
            </header>

            <section className="hero">
                <div className="hero-main">
                    <div className="eyebrow">Total Holdings</div>
                    <div className="hero-value">
                        <span className="tick">{formatSymbol(unit, currency, denomination)}</span>
                        {heroNumber}
                    </div>
                    <div className="hero-sub">
                        <span className="usd">{heroSecondary}</span>
                        <span className={pnl >= 0 ? "delta-pos" : "delta-neg"}>
                            {pnl >= 0 ? "▲" : "▼"} {fiatSymbol}
                            {Math.abs(pnl * rate).toLocaleString(undefined, { maximumFractionDigits: 0 })} ({pnlPct.toFixed(1)}%)
                        </span>
                        <span className="muted">unrealized</span>
                    </div>
                </div>

                <div className="stat-card">
                    <div className="stat-label">30-Day Stack</div>
                    <div className="stat-value">
                        <span className="plus">+</span>
                        {formatAmount(monthDelta, unit, priceUsd, {
                            btcDigits: 4,
                            fiat: currency,
                            denom: denomination,
                        })}
                    </div>
                    <div className="small muted mono">{formatSecondary(monthDelta, unit, priceUsd, currency, denomination)}</div>
                </div>

                <div className="stat-card">
                    <div className="stat-label">12-Month Stack</div>
                    <div className="stat-value">
                        <span className="plus">+</span>
                        {formatAmount(yearDelta, unit, priceUsd, {
                            btcDigits: 4,
                            fiat: currency,
                            denom: denomination,
                        })}
                    </div>
                    <div className="small muted mono">{formatSecondary(yearDelta, unit, priceUsd, currency, denomination)}</div>
                </div>

                <div className="stat-card">
                    <div className="stat-label">Avg. Cost</div>
                    <div className="stat-value">
                        {fiatSymbol}
                        {(avgPrice * rate).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                    </div>
                    <div className="small muted mono">per BTC</div>
                </div>

                <div className="stat-card">
                    <div className="stat-label">BTC Price</div>
                    <div className="stat-value">
                        {fiatSymbol}
                        {(priceUsd * rate).toLocaleString()}
                    </div>
                    <div className="small muted mono">source: {spot.source}</div>
                </div>
            </section>

            <PortfolioChart history={history} priceUsd={priceUsd} unit={unit} />

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
                        <div className="tx-hide-sm">{unit === "BTC" ? `${currency} Value` : "BTC"}</div>
                    </div>
                    {transactions.length === 0 ? (
                        <div className="tx-row muted mono">No transactions yet.</div>
                    ) : (
                        transactions.map((tx) => (
                            <div className="tx-row" key={tx.id}>
                                <div>
                                    <span className={`tx-tag ${tx.type}`}>{tx.type}</span>
                                </div>
                                <div>{tx.date}</div>
                                <div className="tx-amount">
                                    <span className="plus">+</span>
                                    {formatAmount(tx.amount, unit, priceUsd, {
                                        btcDigits: 6,
                                        fiat: currency,
                                        denom: denomination,
                                    })}
                                </div>
                                <div className="tx-hide-sm muted">{tx.source}</div>
                                <div className="tx-hide-sm">{formatSecondary(tx.amount, unit, priceUsd, currency, denomination)}</div>
                            </div>
                        ))
                    )}
                </div>
            </section>

            <section className="section">
                <div className="section-head">
                    <h2 className="section-title">// Encrypted DB Example</h2>
                    <span className="small muted mono">{holdings.length} holdings</span>
                </div>
                {holdingsError ? (
                    <div className="tx-row muted mono">{holdingsError}</div>
                ) : (
                    <pre className="mono small">{JSON.stringify(holdings, null, 2)}</pre>
                )}
            </section>
        </div>
    );
}
