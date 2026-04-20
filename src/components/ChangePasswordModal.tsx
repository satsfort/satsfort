import { useState, type FormEvent } from "react";
import "./Modal.css";
import "./ChangePasswordModal.css";
import { EyeIcon, EyeOffIcon } from "./icons";
import { useEscapeKey } from "../lib/useEscapeKey";
import { changeVaultPassword } from "../db";

type Props = {
    username: string;
    onClose: () => void;
    onPasswordChanged: () => void | Promise<void>;
};

export function ChangePasswordModal({ username, onClose, onPasswordChanged }: Props) {
    useEscapeKey(onClose);

    const [currentPassword, setCurrentPassword] = useState("");
    const [newPassword, setNewPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [showPasswords, setShowPasswords] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const deriveMasterPassword = (rawUsername: string, rawPassword: string): string => `${rawUsername.trim()}:${rawPassword}`;

    const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setError(null);

        if (!currentPassword || !newPassword || !confirmPassword) {
            setError("Fill in current password, new password, and confirmation.");
            return;
        }

        if (newPassword !== confirmPassword) {
            setError("New passwords do not match.");
            return;
        }

        setSubmitting(true);
        try {
            await changeVaultPassword(deriveMasterPassword(username, currentPassword), deriveMasterPassword(username, newPassword));
            await Promise.resolve(onPasswordChanged());
            onClose();
        } catch (changeError) {
            const message = changeError instanceof Error ? changeError.message : String(changeError);
            if (message.includes("Current password is incorrect")) {
                setError("Current password is incorrect.");
            } else {
                setError("Failed to update password. Please try again.");
            }
        } finally {
            setSubmitting(false);
        }
    };

    const passwordInputType = showPasswords ? "text" : "password";

    return (
        <div className="modal-backdrop" onClick={onClose}>
            <div className="modal-card" onClick={(event) => event.stopPropagation()}>
                <div className="modal-head">
                    <h2 className="modal-title">Change Password</h2>
                    <button className="modal-close" onClick={onClose} aria-label="Close">
                        x
                    </button>
                </div>

                <form className="modal-body" onSubmit={(event) => void handleSubmit(event)}>
                    <div className="change-password-note muted small">
                        Account username is fixed: <span className="mono">{username}</span>
                    </div>

                    <div className="modal-field">
                        <label className="modal-label" htmlFor="current-password-input">
                            Current password
                        </label>
                        <div className="change-password-input-wrap">
                            <input
                                id="current-password-input"
                                className="text-input mono with-affix"
                                type={passwordInputType}
                                value={currentPassword}
                                onChange={(event) => setCurrentPassword(event.target.value)}
                                autoComplete="current-password"
                                required
                            />
                            <button
                                type="button"
                                className="change-password-toggle"
                                onClick={() => setShowPasswords((value) => !value)}
                                aria-label={showPasswords ? "Hide passwords" : "Show passwords"}
                                title={showPasswords ? "Hide passwords" : "Show passwords"}
                            >
                                {showPasswords ? <EyeOffIcon /> : <EyeIcon />}
                            </button>
                        </div>
                    </div>

                    <div className="modal-field">
                        <label className="modal-label" htmlFor="new-password-input">
                            New password
                        </label>
                        <div className="change-password-input-wrap">
                            <input
                                id="new-password-input"
                                className="text-input mono with-affix"
                                type={passwordInputType}
                                value={newPassword}
                                onChange={(event) => setNewPassword(event.target.value)}
                                autoComplete="new-password"
                                required
                            />
                            <button
                                type="button"
                                className="change-password-toggle"
                                onClick={() => setShowPasswords((value) => !value)}
                                aria-label={showPasswords ? "Hide passwords" : "Show passwords"}
                                title={showPasswords ? "Hide passwords" : "Show passwords"}
                            >
                                {showPasswords ? <EyeOffIcon /> : <EyeIcon />}
                            </button>
                        </div>
                    </div>

                    <div className="modal-field">
                        <label className="modal-label" htmlFor="confirm-password-input">
                            Confirm new password
                        </label>
                        <div className="change-password-input-wrap">
                            <input
                                id="confirm-password-input"
                                className="text-input mono with-affix"
                                type={passwordInputType}
                                value={confirmPassword}
                                onChange={(event) => setConfirmPassword(event.target.value)}
                                autoComplete="new-password"
                                required
                            />
                            <button
                                type="button"
                                className="change-password-toggle"
                                onClick={() => setShowPasswords((value) => !value)}
                                aria-label={showPasswords ? "Hide passwords" : "Show passwords"}
                                title={showPasswords ? "Hide passwords" : "Show passwords"}
                            >
                                {showPasswords ? <EyeOffIcon /> : <EyeIcon />}
                            </button>
                        </div>
                    </div>

                    {error && <div className="modal-error">{error}</div>}

                    <div className="modal-actions">
                        <button type="button" className="btn" onClick={onClose} disabled={submitting}>
                            Cancel
                        </button>
                        <button type="submit" className="btn btn-primary" disabled={submitting}>
                            {submitting ? "Updating..." : "Change Password & Log Out"}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

