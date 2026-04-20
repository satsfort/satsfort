import { useState } from "react";
import "./LoginPage.css";
import { EyeIcon, EyeOffIcon } from "../components/icons";

type Props = {
    onLogin: (username: string) => void;
};

export function LoginPage({ onLogin }: Props) {
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [submitting, setSubmitting] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setSubmitting(true);
        await new Promise((r) => setTimeout(r, 300));
        if (username.trim() === "admin" && password === "admin") {
            onLogin(username.trim());
        } else {
            setError("Invalid credentials. Access denied.");
        }
        setSubmitting(false);
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
                    <div className="eyebrow">// secure terminal</div>
                    <h1 className="login-title">Authorize</h1>
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

                    {error && (
                        <div className="login-error mono" role="alert">
                            ✗ {error}
                        </div>
                    )}

                    <button type="submit" className="btn btn-primary login-submit" disabled={submitting}>
                        {submitting ? "Verifying…" : "⚡ Authorize"}
                    </button>
                </form>

                <div className="login-hint mono small muted">
                    demo credentials · <span className="mono">admin</span> / <span className="mono">admin</span>
                </div>
            </div>
        </div>
    );
}
