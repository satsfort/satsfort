import { useEffect, useState } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { CopyIcon, EyeIcon, EyeOffIcon, WalletIcon, ExternalLinkIcon, RefreshIcon, ChevronRight } from "../components/icons";
import { AddressBalanceRequests } from "../requests/AddressBalanceRequests";
import { TrackedAddressesRequests } from "../requests/TrackedAddressesRequests";
import { TrackedAddressesService } from "../services/TrackedAddressesService";
import type { TrackedAddress } from "../services/TrackedAddressesService";
import { XpubRequests } from "../requests/XpubRequests";
import type { TrackedXpubMeta, DerivedAddress, DerivationType } from "../requests/XpubRequests";
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
import { useTaskNotifications } from "../lib/TaskNotificationsContext";

type Props = {
    unit: Unit;
    setUnit: (u: Unit) => void;
    balancesHidden: boolean;
    onToggleBalances: () => void;
};

function shorten(addr: string) {
    if (addr.length <= 18) return addr;
    return `${addr.slice(0, 10)}…${addr.slice(-8)}`;
}

function shortenXpub(xpub: string) {
    if (xpub.length <= 24) return xpub;
    return `${xpub.slice(0, 12)}…${xpub.slice(-8)}`;
}

export function AddressesPage({ unit, setUnit, balancesHidden, onToggleBalances }: Props) {
    const [addresses, setAddresses] = useState<TrackedAddress[] | null>(null);
    const [xpubs, setXpubs] = useState<TrackedXpubMeta[]>([]);
    const [derivedAddresses, setDerivedAddresses] = useState<DerivedAddress[]>([]);
    const [expandedXpubs, setExpandedXpubs] = useState<Set<string>>(new Set());
    const [spot, setSpot] = useState<SpotPrice | null>(null);
    const [refreshing, setRefreshing] = useState<string | null>(null);
    const [refreshingAll, setRefreshingAll] = useState(false);
    const [copiedId, setCopiedId] = useState<string | null>(null);
    const [showAddModal, setShowAddModal] = useState(false);
    const [showImportXpubModal, setShowImportXpubModal] = useState(false);
    const [removeTarget, setRemoveTarget] = useState<TrackedAddress | null>(null);
    const [removeXpubTarget, setRemoveXpubTarget] = useState<TrackedXpubMeta | null>(null);
    const { currency, denomination } = useSettings();
    const { track } = useTaskNotifications();

    useEffect(() => {
        // TEMP: artificial delay to preview loading state
        const timer = setTimeout(() => {
            new TrackedAddressesService().execute().then(setAddresses);

            // Load xpubs and derived addresses
            const xpubRequests = new XpubRequests();
            xpubRequests.execute().then(setXpubs);
            xpubRequests.getAllDerivedAddresses().then(setDerivedAddresses);

            track("Spot price", () => new SpotPriceRequests().execute())
                .then(setSpot)
                .catch((err) => {
                    console.error("Failed to fetch spot price", err);
                    setSpot({ usd: 0, source: "unavailable", asOf: new Date().toISOString() });
                });
        }, 2000);
        return () => clearTimeout(timer);
    }, [track]);

    const toggleXpubExpanded = (xpubId: string) => {
        setExpandedXpubs((prev) => {
            const next = new Set(prev);
            if (next.has(xpubId)) {
                next.delete(xpubId);
            } else {
                next.add(xpubId);
            }
            return next;
        });
    };

    const refreshOne = async (addr: TrackedAddress) => {
        setRefreshing(addr.id);
        try {
            const next = await track(`Fetching balance for ${addr.label}`, () => new AddressBalanceRequests().execute(addr.address));
            setAddresses((prev) => (prev ?? []).map((a) => (a.id === addr.id ? { ...a, btc: next.btc, txCount: next.txCount } : a)));
        } catch (err) {
            console.error("Failed to refresh address balance", err);
        } finally {
            setRefreshing(null);
        }
    };

    const refreshAll = async () => {
        if (!addresses || addresses.length === 0) return;
        setRefreshingAll(true);
        try {
            const balances = await track(`Refreshing ${addresses.length} addresses`, () =>
                new AddressBalanceRequests().executeAll(addresses.map((a) => a.address)),
            );
            setAddresses((prev) =>
                (prev ?? []).map((addr) => {
                    const balance = balances.find((b) => b.address === addr.address);
                    if (balance) {
                        return { ...addr, btc: balance.btc, txCount: balance.txCount };
                    }
                    return addr;
                }),
            );
        } catch (err) {
            console.error("Failed to refresh all address balances", err);
        } finally {
            setRefreshingAll(false);
        }
    };

    const handleAddAddress = async (address: string, label: string) => {
        const meta = await new TrackedAddressesRequests().add(address, label);
        const balance = await track(`Fetching balance for ${label}`, () => new AddressBalanceRequests().execute(meta.address));
        const tracked: TrackedAddress = {
            ...meta,
            btc: balance.btc,
            txCount: balance.txCount,
        };
        setAddresses((prev) => [...(prev ?? []), tracked]);
    };

    const handleRemove = async (id: string) => {
        await new TrackedAddressesRequests().remove(id);
        setAddresses((prev) => (prev ?? []).filter((a) => a.id !== id));
    };

    const handleImportXpub = async (xpub: string, label: string, derivationType: DerivationType) => {
        const result = await track(`Importing ${label}`, () => new XpubRequests().add(xpub, label, derivationType));
        setXpubs((prev) => [...prev, result.xpub]);
        setDerivedAddresses((prev) => [...prev, ...result.addresses]);
        // Auto-expand the newly added xpub
        setExpandedXpubs((prev) => new Set([...prev, result.xpub.id]));
    };

    const handleRemoveXpub = async (id: string) => {
        await new XpubRequests().remove(id);
        setXpubs((prev) => prev.filter((x) => x.id !== id));
        setDerivedAddresses((prev) => prev.filter((a) => a.xpubId !== id));
        setExpandedXpubs((prev) => {
            const next = new Set(prev);
            next.delete(id);
            return next;
        });
    };

    const totalAddressCount = (addresses?.length ?? 0) + derivedAddresses.length;
    const hasAnyData = totalAddressCount > 0 || xpubs.length > 0;

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
                {showImportXpubModal && (
                    <ImportXpubModal onClose={() => setShowImportXpubModal(false)} onImport={handleImportXpub} />
                )}
            </>
        );
    }

    const priceUsd = spot.usd;
    const total = addresses.reduce((s, a) => s + a.btc, 0);

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
                        {formatAmount(total, unit, priceUsd, {
                            btcDigits: 8,
                            fiat: currency,
                            denom: denomination,
                        })}
                    </div>
                    <div className="small muted mono">{formatSecondary(total, unit, priceUsd, currency, denomination)}</div>
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
                            const xpubDerivedAddresses = derivedAddresses.filter((a) => a.xpubId === xpub.id);
                            const isExpanded = expandedXpubs.has(xpub.id);

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
                                                                setTimeout(() => setCopiedId((prev) => (prev === xpub.id ? null : prev)), 2000);
                                                            });
                                                        }}
                                                    >
                                                        {copiedId === xpub.id ? <span className="copied-label">Copied!</span> : <CopyIcon />}
                                                    </button>
                                                </div>
                                            </div>
                                            <div className="xpub-stats">
                                                <span className="tx-tag xpub">{xpub.derivationType}</span>
                                                <span className="muted mono small">{xpubDerivedAddresses.length} addresses</span>
                                            </div>
                                        </div>
                                        <div className="addr-meta" onClick={(e) => e.stopPropagation()}>
                                            <span className="muted mono small">added {xpub.added}</span>
                                            <span className="addr-spacer" />
                                            <button className="link-btn danger" onClick={() => setRemoveXpubTarget(xpub)}>
                                                Remove
                                            </button>
                                        </div>
                                    </div>

                                    {isExpanded && xpubDerivedAddresses.length > 0 && (
                                        <div className="xpub-derived-list">
                                            {xpubDerivedAddresses.map((derived) => (
                                                <div key={derived.id} className="derived-addr-row">
                                                    <span className="derived-index mono muted">{derived.index}</span>
                                                    <span className="derived-addr mono">{shorten(derived.address)}</span>
                                                    <span className="derived-path mono muted small">{derived.derivationPath}</span>
                                                    <button
                                                        className="icon-btn"
                                                        title="Copy address"
                                                        aria-label="Copy address"
                                                        onClick={() => {
                                                            void navigator.clipboard.writeText(derived.address).then(() => {
                                                                setCopiedId(derived.id);
                                                                setTimeout(() => setCopiedId((prev) => (prev === derived.id ? null : prev)), 2000);
                                                            });
                                                        }}
                                                    >
                                                        {copiedId === derived.id ? <span className="copied-label">Copied!</span> : <CopyIcon />}
                                                    </button>
                                                    <button
                                                        className="link-btn"
                                                        onClick={() => void openUrl(`https://mempool.space/address/${derived.address}`)}
                                                    >
                                                        <ExternalLinkIcon size={12} />
                                                    </button>
                                                </div>
                                            ))}
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
                                            {formatAmount(a.btc, unit, priceUsd, {
                                                btcDigits: 8,
                                                fiat: currency,
                                                denom: denomination,
                                            })}
                                        </div>
                                        <div className="small muted mono">{formatSecondary(a.btc, unit, priceUsd, currency, denomination)}</div>
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
            {showImportXpubModal && (
                <ImportXpubModal onClose={() => setShowImportXpubModal(false)} onImport={handleImportXpub} />
            )}
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
