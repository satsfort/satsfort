import { useEffect, useState } from "react";
import "./PortfolioPage.css";
import "./BalancePrivacy.css";
import { PortfolioChart } from "../components/PortfolioChart";
import { EyeIcon, EyeOffIcon, BarChartIcon, InfoIcon } from "../components/icons";
import { EmptyState } from "../components/EmptyState";
import type { HistoryPoint } from "../services/model/HistoryPoint";
import { PortfolioHistoryService } from "../services/PortfolioHistoryService";
import { TransactionHistoryService } from "../services/TransactionHistoryService";
import { CostBasisService } from "../services/CostBasisService";
import type { Transaction } from "../services/model/Transaction";
import { SpotPriceRequests } from "../requests/SpotPriceRequests";
import type { SpotPrice } from "../services/model/SpotPrice";
import type { Route } from "../components/Sidebar";
import type { Unit } from "../lib/format";
import { formatAmount, formatBtcLabel, formatNumber, formatSecondary, formatSymbol } from "../lib/format";
import { useSettings } from "../lib/SettingsContext";
import { ExchangeRateRequests } from "../requests/ExchangeRateRequests";
import { LoadingIndicator } from "../components/LoadingIndicator";
import { TaskNotifications } from "../components/TaskNotifications";
import { TransactionsTable } from "../components/TransactionsTable";
import { useTaskNotifications } from "../lib/TaskNotificationsContext";

type Props = {
    unit: Unit;
    setUnit: (u: Unit) => void;
    balancesHidden: boolean;
    onToggleBalances: () => void;
    onNavigate: (route: Route) => void;
    version: number;
};

export function PortfolioPage({ unit, setUnit, balancesHidden, onToggleBalances, onNavigate, version }: Props) {
    const spotPriceRequests = new SpotPriceRequests();
    const exchangeRateRequests = ExchangeRateRequests.getInstance();
    const portfolioHistoryService = new PortfolioHistoryService();
    const transactionHistoryService = new TransactionHistoryService();
    const costBasisService = new CostBasisService();

    const [history, setHistory] = useState<HistoryPoint[] | null>(null);
    const [hasTrackedItems, setHasTrackedItems] = useState<boolean | null>(null);
    const [transactions, setTransactions] = useState<Transaction[] | null>(null);
    const [transactionsError, setTransactionsError] = useState<string | null>(null);
    const [spot, setSpot] = useState<SpotPrice | null>(null);
    const { currency, denomination } = useSettings();
    const { track } = useTaskNotifications();

    // Spot price + exchange rates: fetch once per mount. Tying these to
    // `version === 0` was wrong: if the user adds an address/xpub before ever
    // opening this page, version is already > 0 at mount and spot would never
    // be fetched, leaving the loading guard stuck.
    useEffect(() => {
        track("Spot price", () => spotPriceRequests.execute())
            .then(setSpot)
            .catch((err) => {
                console.error("Failed to fetch spot price", err);
                setSpot({ usd: 0, source: "unavailable", asOf: new Date().toISOString() });
            });
        track("Exchange rates", () => exchangeRateRequests.loadCache()).catch(() => {});
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        // TEMP: artificial delay on first load to preview the loading state.
        const isFirstLoad = version === 0;
        const delay = isFirstLoad ? 2000 : 0;
        const timer = setTimeout(() => {
            void portfolioHistoryService
                .snapshot()
                .then((point) => {
                    setHasTrackedItems(point !== null);
                    return portfolioHistoryService.getAll();
                })
                .then((history) => {
                    console.debug(`Loaded portfolio history with ${history.length} points`);
                    console.debug(history);
                    setHistory(history);
                })
                .catch((err) => {
                    console.error("Failed to load portfolio history", err);
                    setHasTrackedItems(false);
                    setHistory([]);
                });
            transactionHistoryService
                .execute()
                .then((txs) => {
                    setTransactions(txs);
                    setTransactionsError(null);
                })
                .catch((err) => {
                    console.error("Failed to load transactions", err);
                    setTransactions([]);
                    setTransactionsError(err instanceof Error ? err.message : String(err));
                });
        }, delay);
        return () => clearTimeout(timer);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [version]);

    if (history === null || hasTrackedItems === null || transactions === null || !spot) {
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

    const hasNonBaselineHistory = history.some((h) => h.btc > 0);
    if (history.length === 0 || (!hasTrackedItems && !hasNonBaselineHistory)) {
        return (
            <>
                <header className="page-head">
                    <div>
                        <div className="eyebrow">Dashboard</div>
                        <h1 className="page-title">Portfolio</h1>
                    </div>
                    <div className="page-actions">
                        <TaskNotifications />
                    </div>
                </header>
                <EmptyState
                    icon={<BarChartIcon size={56} />}
                    title="No portfolio data yet"
                    description="Add an address to start tracking your stack."
                    action={
                        <button className="btn btn-primary" onClick={() => onNavigate("addresses")}>
                            Go to Addresses
                        </button>
                    }
                />
            </>
        );
    }

    const priceUsd = spot.usd;
    const latest = history[history.length - 1];
    const latestT = new Date(latest.date).getTime();
    const monthAgoBtc = portfolioHistoryService.valueAt(history, new Date(latestT - 30 * 24 * 60 * 60 * 1000));
    const yearAgoBtc = portfolioHistoryService.valueAt(history, new Date(latestT - 365 * 24 * 60 * 60 * 1000));

    const rate = exchangeRateRequests.rateFromUsd(currency);
    const fiatSymbol = formatSymbol("FIAT", currency);

    const usdValue = latest.btc * priceUsd;
    const { costBasis, avgPrice } = costBasisService.compute(history);
    const invested = costBasis;
    const pnl = usdValue - invested;
    const pnlPct = invested > 0 ? (pnl / invested) * 100 : 0;
    const monthDelta = latest.btc - monthAgoBtc;
    const yearDelta = latest.btc - yearAgoBtc;

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
                    <TaskNotifications />
                </div>
            </header>

            <section className="hero">
                <div className="hero-main">
                    <div className="eyebrow">Total Holdings</div>
                    <div className="hero-headline">
                        <div className="hero-value">
                            <span className="tick">{formatSymbol(unit, currency, denomination)}</span>
                            {heroNumber}
                            {unit === "BTC" && denomination === "SATS" && <span className="tick tick-suffix">sats</span>}
                        </div>
                        <div className="hero-meta">
                            <span className="usd">{heroSecondary}</span>
                            <span className={pnl >= 0 ? "delta-pos" : "delta-neg"}>
                                {pnl >= 0 ? "▲" : "▼"} {fiatSymbol}
                                {Math.abs(pnl * rate).toLocaleString(undefined, { maximumFractionDigits: 0 })} ({pnlPct.toFixed(1)}%)
                            </span>
                            <span
                                className="info-tip"
                                tabIndex={0}
                                role="img"
                                aria-label="Unrealized profit and loss: current portfolio value minus average cost basis, valued at today's BTC price."
                                data-tooltip="Unrealized P&L: current portfolio value minus your average cost basis, marked to today's BTC price."
                            >
                                <InfoIcon size={13} />
                            </span>
                        </div>
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
                </div>
                <TransactionsTable
                    transactions={transactions}
                    unit={unit}
                    priceUsd={priceUsd}
                    currency={currency}
                    denomination={denomination}
                    error={transactionsError}
                />
            </section>
        </div>
    );
}
