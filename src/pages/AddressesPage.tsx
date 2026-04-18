import { BTC_PRICE_USD } from "../data/mockHistory";
import type { Unit } from "../lib/format";
import { formatAmount, formatSecondary } from "../lib/format";
import { CopyIcon } from "../components/icons";

type TrackedAddress = {
  id: string;
  label: string;
  address: string;
  btc: number;
  txCount: number;
  type: "Taproot" | "Segwit" | "Legacy";
  added: string;
  xpub?: boolean;
};

const ADDRESSES: TrackedAddress[] = [
  {
    id: "a1",
    label: "Cold Storage · Coldcard Mk4",
    address: "bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh",
    btc: 1.24038211,
    txCount: 14,
    type: "Segwit",
    added: "2024-05-02",
    xpub: true,
  },
  {
    id: "a2",
    label: "Savings · Jade",
    address: "bc1pqqqsyqcyq5rqwzqfpg9scrgwpugpzysnzs23v9ccrydpk8qarc0sj9hjuh",
    btc: 0.51200000,
    txCount: 22,
    type: "Taproot",
    added: "2024-09-14",
  },
  {
    id: "a3",
    label: "Hot Wallet · Strike",
    address: "bc1q34aq5drpuwy3wgl9lhup9892qp6svr8ldzyy7c",
    btc: 0.08210450,
    txCount: 47,
    type: "Segwit",
    added: "2025-01-10",
  },
  {
    id: "a4",
    label: "Legacy Stack",
    address: "1F1tAaz5x1HUXrCNLbtMDqcw6o5GNn4xqX",
    btc: 0.24651339,
    txCount: 3,
    type: "Legacy",
    added: "2024-04-18",
  },
  {
    id: "a5",
    label: "Lightning Collateral",
    address: "bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq",
    btc: 0.02000000,
    txCount: 8,
    type: "Segwit",
    added: "2025-07-22",
  },
];

type Props = {
  unit: Unit;
  setUnit: (u: Unit) => void;
};

function shorten(addr: string) {
  if (addr.length <= 18) return addr;
  return `${addr.slice(0, 10)}…${addr.slice(-8)}`;
}

export function AddressesPage({ unit, setUnit }: Props) {
  const total = ADDRESSES.reduce((s, a) => s + a.btc, 0);

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
          <div className="stat-value mono">{ADDRESSES.length}</div>
          <div className="small muted mono">addresses</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Aggregate Balance</div>
          <div className="stat-value">
            {formatAmount(total, unit, BTC_PRICE_USD, { btcDigits: 8 })}
          </div>
          <div className="small muted mono">
            {formatSecondary(total, unit, BTC_PRICE_USD)}
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
          {ADDRESSES.map((a) => (
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
                    {formatAmount(a.btc, unit, BTC_PRICE_USD, { btcDigits: 8 })}
                  </div>
                  <div className="small muted mono">
                    {formatSecondary(a.btc, unit, BTC_PRICE_USD)}
                  </div>
                </div>
              </div>
              <div className="addr-meta">
                <span className={`tx-tag type-${a.type.toLowerCase()}`}>{a.type}</span>
                {a.xpub && <span className="tx-tag xpub">xpub</span>}
                <span className="muted mono small">· {a.txCount} tx</span>
                <span className="muted mono small">· added {a.added}</span>
                <span className="addr-spacer" />
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
