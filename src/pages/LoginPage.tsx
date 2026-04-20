import { useEffect, useState } from "react";
import "./LoginPage.css";
import { EyeIcon, EyeOffIcon } from "../components/icons";
import { getVaultStatus, unlockDb } from "../db";

type Props = {
    onLogin: (username: string) => void;
};

export function LoginPage({ onLogin }: Props) {
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [submitting, setSubmitting] = useState(false);
    const [vaultExists, setVaultExists] = useState<boolean | null>(null);

    const deriveMasterPassword = (rawUsername: string, rawPassword: string): string => `${rawUsername.trim()}:${rawPassword}`;
    const createMode = vaultExists === false;

    useEffect(() => {
        const loadVaultStatus = async () => {
            try {
                const status = await getVaultStatus();
                setVaultExists(status.database_exists);
            } catch (statusError) {
                console.error("Failed to read vault status", statusError);
                setError("Could not determine vault status. Please try again.");
            }
        };

        void loadVaultStatus();
    }, []);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setSubmitting(true);

        const normalizedUsername = username.trim();
        if (normalizedUsername.length === 0 || password.length === 0) {
            setError("Username and password are required.");
            setSubmitting(false);
            return;
        }

        if (createMode && password !== confirmPassword) {
            setError("Passwords do not match.");
            setSubmitting(false);
            return;
        }

        try {
            await unlockDb(deriveMasterPassword(normalizedUsername, password));
            onLogin(normalizedUsername);
        } catch (unlockError) {
            console.error("Failed to unlock database", unlockError);
            setError(createMode ? "Failed to create encrypted vault." : "Wrong credentials or inaccessible encrypted vault.");
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="login-screen">
            <div className="login-card">
                <div className="login-brand">
                    <div className="brand-mark">
                        <span>₿</span>
                    </div>
                    <div>
                        <div className="brand-name">SATS&nbsp;FORT</div>
                        <div className="muted mono small">sovereign ledger · v0.1</div>
                    </div>
                </div>

                <div className="login-heading">
                    <div className="eyebrow">{createMode ? "// first-time setup" : "// secure login"}</div>
                    <h1 className="login-title">{createMode ? "Create Vault" : "Unlock Vault"}</h1>
                    <div className="login-mode-pill mono small">{vaultExists === null ? "Checking vault status..." : createMode ? "Create new user + password" : "Sign in with existing user + password"}</div>
                </div>

                <form className="login-form" onSubmit={handleSubmit} noValidate>
                    <label className="login-field">
                        <span className="login-prompt mono">&gt; username</span>
                        <input
                            type="text"
                            autoComplete="username"
                            autoCapitalize="none"
                            autoCorrect="off"
                            spellCheck={false}
                            className="text-input mono"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            placeholder="admin"
                            required
                        />
                    </label>

                    <label className="login-field">
                        <span className="login-prompt mono">&gt; password</span>
                        <span className="input-wrap">
                            <input
                                type={showPassword ? "text" : "password"}
                                autoComplete="current-password"
                                className="text-input mono with-affix"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                placeholder="••••••"
                                required
                            />
                            <button
                                type="button"
                                className="input-toggle"
                                onClick={() => setShowPassword((s) => !s)}
                                aria-label={showPassword ? "Hide password" : "Show password"}
                                title={showPassword ? "Hide password" : "Show password"}
                            >
                                {showPassword ? <EyeOffIcon /> : <EyeIcon />}
                            </button>
                        </span>
                    </label>

                    {createMode && (
                        <label className="login-field">
                            <span className="login-prompt mono">&gt; confirm password</span>
                            <input
                                type={showPassword ? "text" : "password"}
                                autoComplete="new-password"
                                className="text-input mono"
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                placeholder="••••••"
                                required
                            />
                        </label>
                    )}

                    {error && (
                        <div className="login-error mono" role="alert">
                            ✗ {error}
                        </div>
                    )}

                    <button type="submit" className="btn btn-primary login-submit" disabled={submitting || vaultExists === null}>
                        {submitting ? (createMode ? "Creating..." : "Unlocking...") : createMode ? "Create Encrypted Vault" : "Unlock Vault"}
                    </button>
                </form>

                <div className="login-hint mono small muted">
                    {createMode
                        ? "This creates your encrypted vault. Keep your user + password safe, recovery is not possible."
                        : "Use the same user + password used when this vault was first created."}
                </div>
            </div>
        </div>
    );
}
