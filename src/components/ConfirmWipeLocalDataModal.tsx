import { useState } from "react";
import "./Modal.css";
import { useEscapeKey } from "../lib/useEscapeKey";

type Props = {
    onClose: () => void;
    onConfirm: () => Promise<void>;
};

export function ConfirmWipeLocalDataModal({ onClose, onConfirm }: Props) {
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEscapeKey(() => {
        if (!submitting) {
            onClose();
        }
    });

    const handleConfirm = async () => {
        setSubmitting(true);
        setError(null);
        try {
            await onConfirm();
            onClose();
        } catch (confirmError) {
            console.error("Failed to wipe local data", confirmError);
            setError("Failed to wipe local data. Please try again.");
            setSubmitting(false);
        }
    };

    const handleBackdropClick = () => {
        if (!submitting) {
            onClose();
        }
    };

    return (
        <div className="modal-backdrop" onClick={handleBackdropClick}>
            <div className="modal-card" onClick={(event) => event.stopPropagation()}>
                <div className="modal-head">
                    <h2 className="modal-title">Wipe all local data?</h2>
                    <button className="modal-close" onClick={onClose} aria-label="Close" disabled={submitting}>
                        x
                    </button>
                </div>

                <div className="modal-body">
                    <p style={{ margin: 0 }}>This deletes your encrypted local vault from this device and logs you out immediately.</p>
                    <p className="small muted" style={{ margin: "0.5rem 0 0" }}>
                        This action cannot be undone. Make sure you remember your username and password.
                    </p>

                    {error && <div className="modal-error">{error}</div>}

                    <div className="modal-actions">
                        <button type="button" className="btn" onClick={onClose} disabled={submitting}>
                            Cancel
                        </button>
                        <button
                            type="button"
                            className="btn btn-danger"
                            onClick={() => void handleConfirm()}
                            disabled={submitting}
                            autoFocus
                        >
                            {submitting ? "Wiping..." : "Wipe"}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
