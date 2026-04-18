import { useEffect, useState } from "react";
import { CopyIcon, EyeIcon, EyeOffIcon, WalletIcon } from "../components/icons";
import { AddressBalanceRequests } from "../requests/AddressBalanceRequests";
import { TrackedAddressesRequests } from "../requests/TrackedAddressesRequests";
import { TrackedAddressesService } from "../services/TrackedAddressesService";
import type { TrackedAddress } from "../services/TrackedAddressesService";
import { SpotPriceRequests } from "../requests/SpotPriceRequests";
import type { SpotPrice } from "../requests/SpotPriceRequests";
import type { Unit } from "../lib/format";
import { formatAmount, formatBtcLabel, formatSecondary, formatSymbol } from "../lib/format";
import { useSettings } from "../lib/SettingsContext";
import { EmptyState } from "../components/EmptyState";
import { AddAddressModal } from "../components/AddAddressModal";

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

export function AddressesPage({
  unit,
  setUnit,
  balancesHidden,
  onToggleBalances,
}: Props) {
  const [addresses, setAddresses] = useState<TrackedAddress[] | null>(null);
  const [spot, setSpot] = useState<SpotPrice | null>(null);
  const [refreshing, setRefreshing] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const { currency, denomination } = useSettings();

  useEffect(() => {
    new TrackedAddressesService().execute().then(setAddresses);
    new SpotPriceRequests().execute().then(setSpot).catch((err) => {
      console.error("Failed to fetch spot price", err);
      setSpot({ usd: 0, source: "unavailable", asOf: new Date().toISOString() });
    });
  }, []);

  const refreshOne = async (addr: TrackedAddress) => {
    setRefreshing(addr.id);
    const next = await new AddressBalanceRequests(addr.address).execute();
    setAddresses((prev) =>
      (prev ?? []).map((a) =>
        a.id === addr.id ? { ...a, btc: next.btc, txCount: next.txCount } : a
      )
    );
    setRefreshing(null);
  };

  const handleAddAddress = async (address: string, label: string) => {
    const meta = await new TrackedAddressesRequests().add(address, label);
    const balance = await new AddressBalanceRequests(meta.address).execute();
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

  if (addresses === null || !spot) {
    return (
      <>
        <header className="page-head">
          <div>
            <div className="eyebrow">Watch-only</div>
            <h1 className="page-title">Addresses</h1>
          </div>
        </header>
        <div className="loading mono muted">Loading…</div>
      </>
    );
  }

  if (addresses.length === 0) {
    return (
      <>
        <header className="page-head">
          <div>
            <div className="eyebrow">Watch-only</div>
            <h1 className="page-title">Addresses</h1>
          </div>
          <div className="page-actions">
            <button className="btn">Import xpub</button>
            <button className="btn btn-primary" onClick={() => setShowAddModal(true)}>+ Add Address</button>
          </div>
        </header>
        <EmptyState
          icon={<WalletIcon size={56} />}
          title="No addresses tracked"
          description="Add a Bitcoin address or import an xpub to start watching your balances."
          action={
            <>
              <button className="btn">Import xpub</button>
              <button className="btn btn-primary" onClick={() => setShowAddModal(true)}>+ Add Address</button>
            </>
          }
        />
        {showAddModal && (
          <AddAddressModal
            onClose={() => setShowAddModal(false)}
            onAdd={handleAddAddress}
          />
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
            <button
              className={`unit-btn ${unit === "BTC" ? "active" : ""}`}
              onClick={() => setUnit("BTC")}
            >
              {formatBtcLabel(denomination)}
            </button>
            <button
              className={`unit-btn ${unit === "FIAT" ? "active" : ""}`}
              onClick={() => setUnit("FIAT")}
            >
              {formatSymbol("FIAT", currency)} {currency}
            </button>
          </div>
          <button className="btn">Import xpub</button>
          <button className="btn btn-primary" onClick={() => setShowAddModal(true)}>+ Add Address</button>
        </div>
      </header>

      <section className="hero">
        <div className="stat-card">
          <div className="stat-label">Tracked</div>
          <div className="stat-value mono">{addresses.length}</div>
          <div className="small muted mono">addresses</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Aggregate Balance</div>
          <div className="stat-value">
            {formatAmount(total, unit, priceUsd, { btcDigits: 8, fiat: currency, denom: denomination })}
          </div>
          <div className="small muted mono">
            {formatSecondary(total, unit, priceUsd, currency, denomination)}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Last Synced</div>
          <div className="stat-value mono">2m ago</div>
          <div className="small muted mono">block 874,120</div>
        </div>
      </section>

      <section className="section">
        <div className="section-head">
          <h2 className="section-title">// Watch List</h2>
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
                          setTimeout(() => setCopiedId((prev) => prev === a.id ? null : prev), 2000);
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
                <button
                  className="link-btn"
                  onClick={() => refreshOne(a)}
                  disabled={refreshing === a.id}
                >
                  {refreshing === a.id ? "Refreshing…" : "Refresh"}
                </button>
                <button className="link-btn">View</button>
                <button className="link-btn danger" onClick={() => handleRemove(a.id)}>Remove</button>
              </div>
            </article>
          ))}
        </div>
      </section>
      {showAddModal && (
        <AddAddressModal
          onClose={() => setShowAddModal(false)}
          onAdd={handleAddAddress}
        />
      )}
    </div>
  );
}
