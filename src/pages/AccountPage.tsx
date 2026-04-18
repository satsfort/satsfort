type Props = {
  username: string;
  onLogout: () => void;
};

export function AccountPage({ username, onLogout }: Props) {
  const initials = username.slice(0, 2).toUpperCase();
  return (
    <>
      <header className="page-head">
        <div>
          <div className="eyebrow">Your profile</div>
          <h1 className="page-title">Account</h1>
        </div>
        <div className="page-actions">
          <button className="btn btn-danger" onClick={onLogout}>
            Log Out
          </button>
        </div>
      </header>

      <section className="account-grid">
        <div className="account-card">
          <div className="account-head">
            <div className="avatar">{initials}</div>
            <div>
              <div className="account-name">{username}</div>
              <div className="muted mono small">{username}@proton.me</div>
            </div>
          </div>
          <div className="account-meta">
            <div>
              <div className="eyebrow">Member since</div>
              <div className="mono">2024-04-18</div>
            </div>
            <div>
              <div className="eyebrow">Last sync</div>
              <div className="mono">2m ago</div>
            </div>
            <div>
              <div className="eyebrow">Plan</div>
              <div className="mono"><span className="tx-tag buy">Free</span></div>
            </div>
            <div>
              <div className="eyebrow">Device</div>
              <div className="mono">Desktop · macOS</div>
            </div>
          </div>
        </div>

        <div className="plan-grid">
          <div className="plan-card">
            <div className="plan-head">
              <div>
                <div className="eyebrow">Current Plan</div>
                <h3 className="plan-title">Free</h3>
              </div>
              <div className="plan-price mono">$0<span>/mo</span></div>
            </div>
            <ul className="plan-list">
              <li>Up to 5 tracked addresses</li>
              <li>7-day price history</li>
              <li>Community support</li>
              <li className="muted">Public price APIs only</li>
            </ul>
            <button className="btn plan-btn" disabled>
              Current
            </button>
          </div>

          <div className="plan-card plan-highlight">
            <div className="plan-badge">Supporter</div>
            <div className="plan-head">
              <div>
                <div className="eyebrow">Upgrade</div>
                <h3 className="plan-title">Supporter</h3>
              </div>
              <div className="plan-price mono">
                21k<span> sats/mo</span>
              </div>
            </div>
            <ul className="plan-list">
              <li>Unlimited tracked addresses</li>
              <li>Full historical price data</li>
              <li>Connect your own node</li>
              <li>CSV &amp; JSON export</li>
              <li>Priority email support</li>
            </ul>
            <button className="btn btn-primary plan-btn">⚡ Upgrade with Lightning</button>
          </div>
        </div>

        <div className="account-card">
          <div className="section-head">
            <h3 className="settings-card-title">Sessions</h3>
            <button className="link-btn danger">Revoke all</button>
          </div>
          <div className="session-row">
            <div>
              <div className="mono">This device · macOS 15.1</div>
              <div className="muted small mono">Signed in 2026-04-12 · San José, CR</div>
            </div>
            <span className="tx-tag transfer">active</span>
          </div>
          <div className="session-row">
            <div>
              <div className="mono">iPhone · iOS 18.3</div>
              <div className="muted small mono">Last seen 2026-04-01 · San José, CR</div>
            </div>
            <button className="link-btn danger">Revoke</button>
          </div>
        </div>
      </section>
    </>
  );
}
