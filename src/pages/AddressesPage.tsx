import { useEffect, useState } from "react";
import "./AddressesPage.css";
import "./BalancePrivacy.css";
import { openUrl } from "@tauri-apps/plugin-opener";
import { CopyIcon, EyeIcon, EyeOffIcon, WalletIcon, ExternalLinkIcon, RefreshIcon, ChevronRight } from "../components/icons";
import { AddressBalanceService } from "../services/AddressBalanceService";
import { TrackedAddressesRequests } from "../requests/TrackedAddressesRequests";
import { TrackedAddressesService } from "../services/TrackedAddressesService";
import type { TrackedAddress } from "../services/TrackedAddressesService";
import { XpubRequests } from "../requests/XpubRequests";
import type { TrackedXpubMeta, DerivedAddress, DerivationType } from "../requests/XpubRequests";
import { PortfolioHistoryService } from "../services/PortfolioHistoryService";
import { SpotPriceRequests } from "../requests/SpotPriceRequests";
import type { SpotPrice } from "../requests/SpotPriceRequests";
import type { Unit } from "../lib/format";
import { formatAmount, formatBtcLabel, formatSecondary, formatSymbol } from "../lib/format";
import { useSettings } from "../lib/SettingsContext";
import { EmptyState } from "../components/EmptyState";
import { AddAddressModal } from "../components/AddAddressModal";
import { ConfirmRemoveAddressModal } from "../components/ConfirmRemoveAddressModal";
import { ImportXpubModal } from "../components/ImportXpubModal";
import { ConfirmRemoveXpubModal } from "../components/ConfirmRemoveXpubModal";
import { LoadingIndicator } from "../components/LoadingIndicator";
import { TaskNotifications } from "../components/TaskNotifications";
import { useTaskNotifications } from "../lib/TaskNotificationsContext";

type Props = {
    unit: Unit;
    setUnit: (u: Unit) => void;
    balancesHidden: boolean;
    onToggleBalances: () => void;
    onPortfolioChanged: () => void;
};

type DerivedBalance = { btc: number; txCount: number };

function shorten(addr: string) {
    if (addr.length <= 18) return addr;
    return `${addr.slice(0, 10)}…${addr.slice(-8)}`;
}

function shortenXpub(xpub: string) {
    if (xpub.length <= 24) return xpub;
    return `${xpub.slice(0, 12)}…${xpub.slice(-8)}`;
}

export function AddressesPage({ unit, setUnit, balancesHidden, onToggleBalances, onPortfolioChanged }: Props) {
    const trackedAddressesService = new TrackedAddressesService();
    const addressBalanceService = new AddressBalanceService();
    const trackedAddressesRequests = new TrackedAddressesRequests();
    const xpubRequests = new XpubRequests();
    const portfolioHistoryService = new PortfolioHistoryService();
    const spotPriceRequests = new SpotPriceRequests();

    const [addresses, setAddresses] = useState<TrackedAddress[] | null>(null);
    const [xpubs, setXpubs] = useState<TrackedXpubMeta[]>([]);
    const [derivedAddresses, setDerivedAddresses] = useState<DerivedAddress[]>([]);
    // Map from address string → balance info
    const [derivedBalances, setDerivedBalances] = useState<Map<string, DerivedBalance>>(new Map());
    const [expandedXpubs, setExpandedXpubs] = useState<Set<string>>(new Set());
    const [spot, setSpot] = useState<SpotPrice | null>(null);
    const [refreshing, setRefreshing] = useState<string | null>(null);
    const [refreshingAll, setRefreshingAll] = useState(false);
    // Track which xpub groups are currently refreshing
    const [refreshingXpub, setRefreshingXpub] = useState<string | null>(null);
    const [copiedId, setCopiedId] = useState<string | null>(null);
    const [showAddModal, setShowAddModal] = useState(false);
    const [showImportXpubModal, setShowImportXpubModal] = useState(false);
    const [removeTarget, setRemoveTarget] = useState<TrackedAddress | null>(null);
    const [removeXpubTarget, setRemoveXpubTarget] = useState<TrackedXpubMeta | null>(null);
    const { currency, denomination } = useSettings();
    const { track } = useTaskNotifications();

    /** Fetches balances for a list of derived addresses and merges them into state. */
    const fetchDerivedBalances = async (addresses: DerivedAddress[]) => {
        const balanceResults = await addressBalanceService.getAll(addresses.map((a) => a.address));
        setDerivedBalances((prev) => {
            const next = new Map(prev);
            for (const result of balanceResults) {
                next.set(result.address, { btc: result.btc, txCount: result.txCount });
            }
            return next;
        });
        const xpubIds = new Set(addresses.map((a) => a.xpubId));
        await Promise.all(Array.from(xpubIds).map((xpubId) => xpubRequests.saveBalance(xpubId)));
    };

    const toggleXpubExpanded = (xpubId: string) => {
        setExpandedXpubs((prev) => {
            const next = new Set(prev);
            if (next.has(xpubId)) next.delete(xpubId);
            else next.add(xpubId);
            return next;
        });
    };

    const refreshOne = async (addr: TrackedAddress) => {
        setRefreshing(addr.id);
        try {
            const next = await track(`Fetching balance for ${addr.label}`, () => addressBalanceService.get(addr.address));
            setAddresses((prev) => (prev ?? []).map((a) => (a.id === addr.id ? { ...a, btc: next.btc, txCount: next.txCount } : a)));
            await portfolioHistoryService.snapshot();
            onPortfolioChanged();
        } catch (err) {
            console.error("Failed to refresh address balance", err);
        } finally {
            setRefreshing(null);
        }
    };

    const refreshXpub = async (xpub: TrackedXpubMeta, xpubDerived: DerivedAddress[]) => {
        setRefreshingXpub(xpub.id);
        try {
            await track(`Refreshing ${xpub.label}`, () => fetchDerivedBalances(xpubDerived));
            await portfolioHistoryService.snapshot();
            onPortfolioChanged();
        } catch (err) {
            console.error("Failed to refresh xpub balances", err);
        } finally {
            setRefreshingXpub(null);
        }
    };

    const refreshAll = async () => {
        setRefreshingAll(true);
        try {
            const allTasks: Promise<void>[] = [];

            if (addresses && addresses.length > 0) {
                allTasks.push(
                    track(`Refreshing ${addresses.length} individual addresses`, () =>
                        addressBalanceService.getAll(addresses.map((a) => a.address)),
                    ).then((balances) => {
                        setAddresses((prev) =>
                            (prev ?? []).map((addr) => {
                                const balance = balances.find((b) => b.address === addr.address);
                                return balance ? { ...addr, btc: balance.btc, txCount: balance.txCount } : addr;
                            }),
                        );
                    }),
                );
            }

            if (derivedAddresses.length > 0) {
                allTasks.push(track(`Refreshing ${derivedAddresses.length} xpub addresses`, () => fetchDerivedBalances(derivedAddresses)));
            }

            await Promise.all(allTasks);
            await portfolioHistoryService.snapshot();
            onPortfolioChanged();
        } catch (err) {
            console.error("Failed to refresh all balances", err);
        } finally {
            setRefreshingAll(false);
        }
    };

    const handleAddAddress = async (address: string, label: string) => {
        const meta = await trackedAddressesRequests.add(address, label);
        const balance = await track(`Fetching balance for ${label}`, () => addressBalanceService.get(meta.address));
        const tracked: TrackedAddress = { ...meta, btc: balance.btc, txCount: balance.txCount };
        setAddresses((prev) => [...(prev ?? []), tracked]);
        await portfolioHistoryService.snapshot();
        onPortfolioChanged();
    };

    const handleRemove = async (id: string) => {
        await trackedAddressesRequests.remove(id);
        setAddresses((prev) => (prev ?? []).filter((a) => a.id !== id));
        await portfolioHistoryService.snapshot();
        onPortfolioChanged();
    };

    const handleImportXpub = async (xpub: string, label: string, derivationType: DerivationType) => {
        const result = await track(`Importing ${label}`, () => xpubRequests.add(xpub, label, derivationType));
        setXpubs((prev) => [...prev, result.xpub]);
        setDerivedAddresses((prev) => [...prev, ...result.addresses]);
        setExpandedXpubs((prev) => new Set([...prev, result.xpub.id]));
        // Fetch balances for newly derived addresses
        await track(`Fetching balances for ${label}`, () => fetchDerivedBalances(result.addresses));
        await portfolioHistoryService.snapshot();
        onPortfolioChanged();
    };

    const handleRemoveXpub = async (id: string) => {
        await xpubRequests.remove(id);
        setXpubs((prev) => prev.filter((x) => x.id !== id));
        // Remove balances for this xpub's derived addresses
        const removedAddresses = derivedAddresses.filter((a) => a.xpubId === id).map((a) => a.address);
        setDerivedAddresses((prev) => prev.filter((a) => a.xpubId !== id));
        setDerivedBalances((prev) => {
            const next = new Map(prev);
            for (const addr of removedAddresses) next.delete(addr);
            return next;
        });
        setExpandedXpubs((prev) => {
            const next = new Set(prev);
            next.delete(id);
            return next;
        });
        await portfolioHistoryService.snapshot();
        onPortfolioChanged();
    };

    const totalAddressCount = (addresses?.length ?? 0) + derivedAddresses.length;
    const hasAnyData = totalAddressCount > 0 || xpubs.length > 0;
    const xpubTotal = Array.from(derivedBalances.values()).reduce((s, b) => s + b.btc, 0);

    useEffect(() => {
        // TEMP: artificial delay to preview loading state
        const timer = setTimeout(() => {
            trackedAddressesService.execute().then(setAddresses);

            // Load xpubs and derived addresses, then fetch their balances
            void Promise.all([xpubRequests.execute(), xpubRequests.getAllDerivedAddresses()]).then(([loadedXpubs, loadedDerived]) => {
                setXpubs(loadedXpubs);
                setDerivedAddresses(loadedDerived);
                if (loadedDerived.length > 0) {
                    void fetchDerivedBalances(loadedDerived);
                }
            });

            track("Spot price", () => spotPriceRequests.execute())
                .then(setSpot)
                .catch((err) => {
                    console.error("Failed to fetch spot price", err);
                    setSpot({ usd: 0, source: "unavailable", asOf: new Date().toISOString() });
                });
        }, 2000);
        return () => clearTimeout(timer);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [track]);

    if (addresses === null || !spot) {
        return (
            <>
                <header className="page-head">
                    <div>
                        <div className="eyebrow">Watch-only</div>
                        <h1 className="page-title">Addresses</h1>
                    </div>
                </header>
                <LoadingIndicator />
            </>
        );
    }

    if (!hasAnyData) {
        return (
            <>
                <header className="page-head">
                    <div>
                        <div className="eyebrow">Watch-only</div>
                        <h1 className="page-title">Addresses</h1>
                    </div>
                    <div className="page-actions">
                        <button className="btn" onClick={() => setShowImportXpubModal(true)}>
                            Import xpub
                        </button>
                        <button className="btn btn-primary" onClick={() => setShowAddModal(true)}>
                            + Add Address
                        </button>
                        <TaskNotifications />
                    </div>
                </header>
                <EmptyState
                    icon={<WalletIcon size={56} />}
                    title="No addresses tracked"
                    description="Add a Bitcoin address or import an xpub to start watching your balances."
                    action={
                        <>
                            <button className="btn" onClick={() => setShowImportXpubModal(true)}>
                                Import xpub
                            </button>
                            <button className="btn btn-primary" onClick={() => setShowAddModal(true)}>
                                + Add Address
                            </button>
                        </>
                    }
                />
                {showAddModal && <AddAddressModal onClose={() => setShowAddModal(false)} onAdd={handleAddAddress} />}
                {showImportXpubModal && <ImportXpubModal onClose={() => setShowImportXpubModal(false)} onImport={handleImportXpub} />}
            </>
        );
    }

    const priceUsd = spot.usd;
    const individualTotal = addresses.reduce((s, a) => s + a.btc, 0);
    const grandTotal = individualTotal + xpubTotal;

    return (
        <div className={balancesHidden ? "balances-hidden" : undefined}>
            <header className="page-head">
                <div>
                    <div className="eyebrow">Watch-only</div>
                    <h1 className="page-title">Addresses</h1>
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
                    <button
                        className="btn btn-with-icon"
                        onClick={() => void refreshAll()}
                        disabled={refreshingAll}
                        title="Refresh all address balances"
                    >
                        <RefreshIcon size={14} />
                        {refreshingAll ? "Refreshing…" : "Refresh All"}
                    </button>
                    <button className="btn" onClick={() => setShowImportXpubModal(true)}>
                        Import xpub
                    </button>
                    <button className="btn btn-primary" onClick={() => setShowAddModal(true)}>
                        + Add Address
                    </button>
                    <TaskNotifications />
                </div>
            </header>

            <section className="hero">
                <div className="stat-card">
                    <div className="stat-label">Tracked</div>
                    <div className="stat-value mono">{totalAddressCount}</div>
                    <div className="small muted mono">addresses</div>
                </div>
                <div className="stat-card">
                    <div className="stat-label">Aggregate Balance</div>
                    <div className="stat-value">
                        {formatAmount(grandTotal, unit, priceUsd, { btcDigits: 8, fiat: currency, denom: denomination })}
                    </div>
                    <div className="small muted mono">{formatSecondary(grandTotal, unit, priceUsd, currency, denomination)}</div>
                </div>
                <div className="stat-card">
                    <div className="stat-label">Last Synced</div>
                    <div className="stat-value mono">2m ago</div>
                    <div className="small muted mono">block 874,120</div>
                </div>
            </section>

            {/* Xpub Groups */}
            {xpubs.length > 0 && (
                <section className="section">
                    <div className="section-head">
                        <h2 className="section-title">// Extended Public Keys</h2>
                        <span className="small muted mono">{xpubs.length} imported</span>
                    </div>
                    <div className="addr-list">
                        {xpubs.map((xpub) => {
                            const xpubDerived = derivedAddresses.filter((a) => a.xpubId === xpub.id);
                            const isExpanded = expandedXpubs.has(xpub.id);
                            const isRefreshingThisXpub = refreshingXpub === xpub.id;
                            const xpubBtc = xpubDerived.reduce((s, a) => s + (derivedBalances.get(a.address)?.btc ?? 0), 0);
                            const balancesLoaded = xpubDerived.some((a) => derivedBalances.has(a.address));

                            return (
                                <article key={xpub.id} className="xpub-group">
                                    <div className="xpub-card" onClick={() => toggleXpubExpanded(xpub.id)}>
                                        <div className="xpub-card-head">
                                            <button
                                                className={`xpub-expand-btn ${isExpanded ? "expanded" : ""}`}
                                                aria-expanded={isExpanded}
                                                aria-label={isExpanded ? "Collapse" : "Expand"}
                                            >
                                                <ChevronRight size={16} />
                                            </button>
                                            <div className="xpub-info">
                                                <div className="addr-label">{xpub.label}</div>
                                                <div className="addr-string mono">
                                                    <span>{shortenXpub(xpub.xpub)}</span>
                                                    <button
                                                        className="icon-btn"
                                                        title="Copy xpub"
                                                        aria-label="Copy xpub"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            void navigator.clipboard.writeText(xpub.xpub).then(() => {
                                                                setCopiedId(xpub.id);
                                                                setTimeout(
                                                                    () => setCopiedId((prev) => (prev === xpub.id ? null : prev)),
                                                                    2000,
                                                                );
                                                            });
                                                        }}
                                                    >
                                                        {copiedId === xpub.id ? (
                                                            <span className="copied-label">Copied!</span>
                                                        ) : (
                                                            <CopyIcon />
                                                        )}
                                                    </button>
                                                </div>
                                            </div>
                                            <div className="xpub-stats">
                                                <span className="tx-tag xpub">{xpub.derivationType}</span>
                                                <span className="muted mono small">{xpubDerived.length} addresses</span>
                                            </div>
                                            <div className="addr-balance" onClick={(e) => e.stopPropagation()}>
                                                <div className="addr-amount">
                                                    {balancesLoaded ? (
                                                        formatAmount(xpubBtc, unit, priceUsd, {
                                                            btcDigits: 8,
                                                            fiat: currency,
                                                            denom: denomination,
                                                        })
                                                    ) : (
                                                        <span className="muted small mono">loading…</span>
                                                    )}
                                                </div>
                                                {balancesLoaded && (
                                                    <div className="small muted mono">
                                                        {formatSecondary(xpubBtc, unit, priceUsd, currency, denomination)}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                        <div className="addr-meta" onClick={(e) => e.stopPropagation()}>
                                            <span className="muted mono small">added {xpub.added}</span>
                                            <span className="addr-spacer" />
                                            <button
                                                className="link-btn"
                                                onClick={() => void refreshXpub(xpub, xpubDerived)}
                                                disabled={isRefreshingThisXpub}
                                            >
                                                {isRefreshingThisXpub ? "Refreshing…" : "Refresh"}
                                            </button>
                                            <button className="link-btn danger" onClick={() => setRemoveXpubTarget(xpub)}>
                                                Remove
                                            </button>
                                        </div>
                                    </div>

                                    {isExpanded && xpubDerived.length > 0 && (
                                        <div className="xpub-derived-list">
                                            {xpubDerived.map((derived) => {
                                                const bal = derivedBalances.get(derived.address);
                                                return (
                                                    <div key={derived.id} className="derived-addr-row">
                                                        <span className="derived-index mono muted">{derived.index}</span>
                                                        <span className="derived-addr mono">{shorten(derived.address)}</span>
                                                        <span className="derived-path mono muted small">{derived.derivationPath}</span>
                                                        <span className="derived-balance">
                                                            {bal !== undefined ? (
                                                                <span className="mono small">
                                                                    {formatAmount(bal.btc, unit, priceUsd, {
                                                                        btcDigits: 8,
                                                                        fiat: currency,
                                                                        denom: denomination,
                                                                    })}
                                                                </span>
                                                            ) : (
                                                                <span className="muted small mono">…</span>
                                                            )}
                                                        </span>
                                                        <button
                                                            className="icon-btn"
                                                            title="Copy address"
                                                            aria-label="Copy address"
                                                            onClick={() => {
                                                                void navigator.clipboard.writeText(derived.address).then(() => {
                                                                    setCopiedId(derived.id);
                                                                    setTimeout(
                                                                        () => setCopiedId((prev) => (prev === derived.id ? null : prev)),
                                                                        2000,
                                                                    );
                                                                });
                                                            }}
                                                        >
                                                            {copiedId === derived.id ? (
                                                                <span className="copied-label">Copied!</span>
                                                            ) : (
                                                                <CopyIcon />
                                                            )}
                                                        </button>
                                                        <button
                                                            className="link-btn"
                                                            onClick={() => void openUrl(`https://mempool.space/address/${derived.address}`)}
                                                        >
                                                            <ExternalLinkIcon size={12} />
                                                        </button>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </article>
                            );
                        })}
                    </div>
                </section>
            )}

            {/* Individual Addresses */}
            {addresses.length > 0 && (
                <section className="section">
                    <div className="section-head">
                        <h2 className="section-title">// Individual Addresses</h2>
                        <span className="small muted mono">sorted by balance</span>
                    </div>
                    <div className="addr-list">
                        {addresses.map((a) => (
                            <article key={a.id} className="addr-card">
                                <div className="addr-card-head">
                                    <div>
                                        <div className="addr-label">{a.label}</div>
                                        <div className="addr-string mono">
                                            <span>{shorten(a.address)}</span>
                                            <button
                                                className="icon-btn"
                                                title="Copy address"
                                                aria-label="Copy address"
                                                onClick={() => {
                                                    void navigator.clipboard.writeText(a.address).then(() => {
                                                        setCopiedId(a.id);
                                                        setTimeout(() => setCopiedId((prev) => (prev === a.id ? null : prev)), 2000);
                                                    });
                                                }}
                                            >
                                                {copiedId === a.id ? <span className="copied-label">Copied!</span> : <CopyIcon />}
                                            </button>
                                        </div>
                                    </div>
                                    <div className="addr-balance">
                                        <div className="addr-amount">
                                            {formatAmount(a.btc, unit, priceUsd, { btcDigits: 8, fiat: currency, denom: denomination })}
                                        </div>
                                        <div className="small muted mono">
                                            {formatSecondary(a.btc, unit, priceUsd, currency, denomination)}
                                        </div>
                                    </div>
                                </div>
                                <div className="addr-meta">
                                    <span className={`tx-tag type-${a.type.toLowerCase()}`}>{a.type}</span>
                                    {a.xpub && <span className="tx-tag xpub">xpub</span>}
                                    <span className="muted mono small">· {a.txCount} tx</span>
                                    <span className="muted mono small">· added {a.added}</span>
                                    <span className="addr-spacer" />
                                    <button className="link-btn" onClick={() => refreshOne(a)} disabled={refreshing === a.id}>
                                        {refreshing === a.id ? "Refreshing…" : "Refresh"}
                                    </button>
                                    <button className="link-btn danger" onClick={() => setRemoveTarget(a)}>
                                        Remove
                                    </button>
                                    <button className="link-btn" onClick={() => void openUrl(`https://mempool.space/address/${a.address}`)}>
                                        View <ExternalLinkIcon size={12} />
                                    </button>
                                </div>
                            </article>
                        ))}
                    </div>
                </section>
            )}

            {showAddModal && <AddAddressModal onClose={() => setShowAddModal(false)} onAdd={handleAddAddress} />}
            {showImportXpubModal && <ImportXpubModal onClose={() => setShowImportXpubModal(false)} onImport={handleImportXpub} />}
            {removeTarget && (
                <ConfirmRemoveAddressModal
                    label={removeTarget.label}
                    address={removeTarget.address}
                    onClose={() => setRemoveTarget(null)}
                    onConfirm={() => handleRemove(removeTarget.id)}
                />
            )}
            {removeXpubTarget && (
                <ConfirmRemoveXpubModal
                    label={removeXpubTarget.label}
                    addressCount={removeXpubTarget.addressCount}
                    onClose={() => setRemoveXpubTarget(null)}
                    onConfirm={() => handleRemoveXpub(removeXpubTarget.id)}
                />
            )}
        </div>
    );
}
