import { useState } from "react";
import "./SettingsPage.css";
import { useSettings } from "../lib/SettingsContext";
import type { FiatCurrency } from "../lib/SettingsContext";
import { SettingsRequests } from "../requests/SettingsRequests";
import { ChangePasswordModal } from "../components/ChangePasswordModal";
import { ConfirmWipeLocalDataModal } from "../components/ConfirmWipeLocalDataModal";
import { TaskNotifications } from "../components/TaskNotifications";
import { wipeLocalData } from "../db";

type Props = {
    username: string;
    onLogout: () => void | Promise<void>;
};

export function SettingsPage({ username, onLogout }: Props) {
    const initialSettings = SettingsRequests.loadSync();
    const { currency, setCurrency, denomination, setDenomination } = useSettings();
    const [passwordModalOpen, setPasswordModalOpen] = useState(false);
    const [wipeModalOpen, setWipeModalOpen] = useState(false);
    const { useOwnNode, nodeUrl, autoSync } = initialSettings;

    const handleWipeLocalData = async () => {
        await wipeLocalData();
        await Promise.resolve(onLogout());
    };

    return (
        <>
            <header className="page-head">
                <div>
                    <div className="eyebrow">Preferences</div>
                    <h1 className="page-title">Settings</h1>
                </div>
                <div className="page-actions">
                    <button className="btn btn-danger" onClick={() => void onLogout()}>
                        Lock Vault
                    </button>
                    <TaskNotifications />
                </div>
            </header>

            <section className="settings-grid">
                <div className="settings-card">
                    <div className="settings-card-head">
                        <h3 className="settings-card-title">Display</h3>
                        <p className="muted small">How balances and prices are rendered across the app.</p>
                    </div>

                    <Row label="Fiat currency">
                        <select className="text-input" value={currency} onChange={(e) => setCurrency(e.target.value as FiatCurrency)}>
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
                            <button className={`seg-btn ${denomination === "BTC" ? "active" : ""}`} onClick={() => setDenomination("BTC")}>
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
                </div>

                <div className="settings-card danger-card">
                    <div className="settings-card-head">
                        <h3 className="settings-card-title">Danger Zone</h3>
                        <p className="muted small">These actions are irreversible.</p>
                    </div>
                    <Row label="Wipe all local data">
                        <button className="btn btn-danger" onClick={() => setWipeModalOpen(true)}>
                            Wipe
                        </button>
                    </Row>
                </div>

                <div className="settings-card">
                    <div className="settings-card-head">
                        <h3 className="settings-card-title">Security</h3>
                        <p className="muted small">Manage the credentials that unlock your local vault.</p>
                    </div>

                    <Row label="Password" hint="Used to encrypt your local data.">
                        <button className="btn btn-primary" onClick={() => setPasswordModalOpen(true)}>
                            Change Password
                        </button>
                    </Row>
                </div>

                <div className="settings-card coming-soon-card">
                    <div className="settings-card-head">
                        <h3 className="settings-card-title">
                            Data <span className="coming-soon-badge">Coming Soon</span>
                        </h3>
                        <p className="muted small">Move your tracked addresses and history in or out.</p>
                    </div>

                    <Row label="Import data">
                        <button className="btn" disabled>
                            Upload .json
                        </button>
                    </Row>

                    <Row label="Export data">
                        <button className="btn" disabled>
                            Download .json
                        </button>
                    </Row>
                </div>

                <div className="settings-card coming-soon-card">
                    <div className="settings-card-head">
                        <h3 className="settings-card-title">
                            Node <span className="coming-soon-badge">Coming Soon</span>
                        </h3>
                        <p className="muted small">Skip third parties. Point the app at a node you control.</p>
                    </div>

                    <Row label="Use your own node" hint="Disable public APIs and query your Bitcoin Core or Electrum endpoint instead.">
                        <Toggle checked={useOwnNode} onChange={() => {}} disabled />
                    </Row>

                    <Row label="RPC / Electrum URL" hint="Only used when 'Use your own node' is enabled.">
                        <input className="text-input mono" type="text" value={nodeUrl} onChange={() => {}} disabled spellCheck={false} />
                    </Row>

                    <Row label="Auto-sync" hint="Re-fetch balances every 60 seconds while the app is open.">
                        <Toggle checked={autoSync} onChange={() => {}} disabled />
                    </Row>
                </div>
            </section>

            {passwordModalOpen && (
                <ChangePasswordModal
                    username={username}
                    onClose={() => setPasswordModalOpen(false)}
                    onPasswordChanged={() => Promise.resolve(onLogout())}
                />
            )}

            {wipeModalOpen && <ConfirmWipeLocalDataModal onClose={() => setWipeModalOpen(false)} onConfirm={handleWipeLocalData} />}
        </>
    );
}

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
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

function Toggle({ checked, onChange, disabled = false }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
    return (
        <button
            role="switch"
            aria-checked={checked}
            className={`switch ${checked ? "on" : ""}`}
            onClick={() => !disabled && onChange(!checked)}
            disabled={disabled}
        >
            <span className="switch-thumb" />
        </button>
    );
}
