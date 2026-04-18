import { useEffect, useState } from "react";
import { CopyIcon } from "../components/icons";
import { AddressBalanceRequest } from "../requests/AddressBalanceRequest";
import { TrackedAddressesRequest } from "../requests/TrackedAddressesRequest";
import type { TrackedAddress } from "../requests/TrackedAddressesRequest";
import { SpotPriceRequest } from "../requests/SpotPriceRequest";
import type { SpotPrice } from "../requests/SpotPriceRequest";
import type { Unit } from "../lib/format";
import { formatAmount, formatSecondary } from "../lib/format";

type Props = {
  unit: Unit;
  setUnit: (u: Unit) => void;
};

function shorten(addr: string) {
  if (addr.length <= 18) return addr;
  return `${addr.slice(0, 10)}…${addr.slice(-8)}`;
}

export function AddressesPage({ unit, setUnit }: Props) {
  const [addresses, setAddresses] = useState<TrackedAddress[]>([]);
  const [spot, setSpot] = useState<SpotPrice | null>(null);
  const [refreshing, setRefreshing] = useState<string | null>(null);

  useEffect(() => {
    new TrackedAddressesRequest().execute().then(setAddresses);
    new SpotPriceRequest().execute().then(setSpot);
  }, []);

  const refreshOne = async (addr: TrackedAddress) => {
    setRefreshing(addr.id);
    const next = await new AddressBalanceRequest(addr.address).execute();
    setAddresses((prev) =>
      prev.map((a) =>
        a.id === addr.id ? { ...a, btc: next.btc, txCount: next.txCount } : a
      )
    );
    setRefreshing(null);
  };

  if (addresses.length === 0 || !spot) {
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

  const priceUsd = spot.usd;
  const total = addresses.reduce((s, a) => s + a.btc, 0);

  return (
    <>
      <header className="page-head">
        <div>
          <div className="eyebrow">Watch-only</div>
          <h1 className="page-title">Addresses</h1>
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
          <button className="btn">Import xpub</button>
          <button className="btn btn-primary">+ Add Address</button>
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
            {formatAmount(total, unit, priceUsd, { btcDigits: 8 })}
          </div>
          <div className="small muted mono">
            {formatSecondary(total, unit, priceUsd)}
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
                    >
                      <CopyIcon />
                    </button>
                  </div>
                </div>
                <div className="addr-balance">
                  <div className="addr-amount">
                    {formatAmount(a.btc, unit, priceUsd, { btcDigits: 8 })}
                  </div>
                  <div className="small muted mono">
                    {formatSecondary(a.btc, unit, priceUsd)}
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
                <button className="link-btn danger">Remove</button>
              </div>
            </article>
          ))}
        </div>
      </section>
    </>
  );
}
