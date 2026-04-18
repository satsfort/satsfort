import { useState } from "react";
import { useSettings } from "../lib/SettingsContext";
import type { FiatCurrency } from "../lib/SettingsContext";
import {
  LoadSettingsRequest,
  SaveSettingsRequest,
  type PriceSource,
} from "../requests/SettingsRequest";

export function SettingsPage() {
  const initialSettings = LoadSettingsRequest.loadSync();
  const { currency, setCurrency, denomination, setDenomination } = useSettings();
  const [useOwnNode, setUseOwnNode] = useState(initialSettings.useOwnNode);
  const [nodeUrl, setNodeUrl] = useState(initialSettings.nodeUrl);
  const [priceSource, setPriceSource] = useState<PriceSource>(initialSettings.priceSource);
  const [telemetry, setTelemetry] = useState(initialSettings.telemetry);
  const [autoSync, setAutoSync] = useState(initialSettings.autoSync);

  const handleReset = () => {
    const settings = LoadSettingsRequest.loadSync();
    setCurrency(settings.currency);
    setDenomination(settings.denomination);
    setUseOwnNode(settings.useOwnNode);
    setNodeUrl(settings.nodeUrl);
    setPriceSource(settings.priceSource);
    setTelemetry(settings.telemetry);
    setAutoSync(settings.autoSync);
  };

  const handleSave = async () => {
    await new SaveSettingsRequest({
      currency,
      denomination,
      useOwnNode,
      nodeUrl,
      priceSource,
      telemetry,
      autoSync,
    }).execute();
  };

  return (
    <>
      <header className="page-head">
        <div>
          <div className="eyebrow">Preferences</div>
          <h1 className="page-title">Settings</h1>
        </div>
        <div className="page-actions">
          <button className="btn" onClick={handleReset}>Reset</button>
          <button className="btn btn-primary" onClick={() => void handleSave()}>Save Changes</button>
        </div>
      </header>

      <section className="settings-grid">
        <div className="settings-card">
          <div className="settings-card-head">
            <h3 className="settings-card-title">Node</h3>
            <p className="muted small">
              Skip third parties. Point the app at a node you control.
            </p>
          </div>

          <Row label="Use your own node" hint="Disable public APIs and query your Bitcoin Core or Electrum endpoint instead.">
            <Toggle checked={useOwnNode} onChange={setUseOwnNode} />
          </Row>

          <Row label="RPC / Electrum URL" hint="Only used when 'Use your own node' is enabled.">
            <input
              className="text-input mono"
              type="text"
              value={nodeUrl}
              onChange={(e) => setNodeUrl(e.target.value)}
              disabled={!useOwnNode}
              spellCheck={false}
            />
          </Row>

          <Row label="Auto-sync" hint="Re-fetch balances every 60 seconds while the app is open.">
            <Toggle checked={autoSync} onChange={setAutoSync} />
          </Row>
        </div>

        <div className="settings-card">
          <div className="settings-card-head">
            <h3 className="settings-card-title">Display</h3>
            <p className="muted small">How balances and prices are rendered across the app.</p>
          </div>

          <Row label="Fiat currency">
            <select
              className="text-input"
              value={currency}
              onChange={(e) => setCurrency(e.target.value as FiatCurrency)}
            >
              <option value="USD">USD — US Dollar</option>
              <option value="EUR">EUR — Euro</option>
              <option value="GBP">GBP — Pound Sterling</option>
              <option value="JPY">JPY — Japanese Yen</option>
              <option value="CAD">CAD — Canadian Dollar</option>
              <option value="AUD">AUD — Australian Dollar</option>
            </select>
          </Row>

          <Row label="Denomination" hint="Whole BTC or satoshis.">
            <div className="seg">
              <button
                className={`seg-btn ${denomination === "BTC" ? "active" : ""}`}
                onClick={() => setDenomination("BTC")}
              >
                ₿ BTC
              </button>
              <button
                className={`seg-btn ${denomination === "SATS" ? "active" : ""}`}
                onClick={() => setDenomination("SATS")}
              >
                sats
              </button>
            </div>
          </Row>

          <Row label="Price source" hint="Exchange used for the spot price conversion.">
            <select
              className="text-input"
              value={priceSource}
              onChange={(e) => setPriceSource(e.target.value as PriceSource)}
            >
              <option value="kraken">Kraken</option>
              <option value="bitstamp">Bitstamp</option>
              <option value="coinbase">Coinbase</option>
              <option value="average">Average of above</option>
            </select>
          </Row>
        </div>

        <div className="settings-card">
          <div className="settings-card-head">
            <h3 className="settings-card-title">Privacy</h3>
            <p className="muted small">No tracking by default. Toggle what you want to share.</p>
          </div>

          <Row label="Anonymous telemetry" hint="Send crash reports and latency metrics — no wallet or address data.">
            <Toggle checked={telemetry} onChange={setTelemetry} />
          </Row>

          <Row label="Export data">
            <button className="btn">Download .json</button>
          </Row>

          <Row label="Clear local cache" hint="Removes cached price history and block headers.">
            <button className="btn">Clear</button>
          </Row>
        </div>

        <div className="settings-card danger-card">
          <div className="settings-card-head">
            <h3 className="settings-card-title">Danger Zone</h3>
            <p className="muted small">These actions are irreversible.</p>
          </div>
          <Row label="Delete all tracked addresses">
            <button className="btn btn-danger">Delete</button>
          </Row>
          <Row label="Wipe application state">
            <button className="btn btn-danger">Wipe</button>
          </Row>
        </div>
      </section>
    </>
  );
}

function Row({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="settings-row">
      <div className="settings-row-text">
        <div className="settings-row-label">{label}</div>
        {hint && <div className="muted small">{hint}</div>}
      </div>
      <div className="settings-row-control">{children}</div>
    </div>
  );
}

function Toggle({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      className={`switch ${checked ? "on" : ""}`}
      onClick={() => onChange(!checked)}
    >
      <span className="switch-thumb" />
    </button>
  );
}
