import { useState } from "react";
import { validateBitcoinAddress } from "../requests/TrackedAddressesRequests";

type AddAddressModalProps = {
    onClose: () => void;
    onAdd: (address: string, label: string) => Promise<void>;
};

export function AddAddressModal({ onClose, onAdd }: AddAddressModalProps) {
    const [address, setAddress] = useState("");
    const [label, setLabel] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [submitting, setSubmitting] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);

        const validationError = await validateBitcoinAddress(address);
        if (validationError) {
            setError(validationError);
            return;
        }
        if (label.trim().length === 0) {
            setError("Label is required");
            return;
        }

        setSubmitting(true);
        try {
            await onAdd(address, label);
            onClose();
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to add address");
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="modal-backdrop" onClick={onClose}>
            <div className="modal-card" onClick={(e) => e.stopPropagation()}>
                <div className="modal-head">
                    <h2 className="modal-title">Add Address</h2>
                    <button className="modal-close" onClick={onClose} aria-label="Close">
                        ×
                    </button>
                </div>

                <form className="modal-body" onSubmit={(e) => void handleSubmit(e)}>
                    <div className="modal-field">
                        <label className="modal-label" htmlFor="addr-input">
                            Bitcoin address
                        </label>
                        <input
                            id="addr-input"
                            className="text-input mono"
                            type="text"
                            placeholder="bc1q... / bc1p... / 1... / 3..."
                            value={address}
                            onChange={(e) => setAddress(e.target.value)}
                            spellCheck={false}
                            autoFocus
                        />
                    </div>

                    <div className="modal-field">
                        <label className="modal-label" htmlFor="label-input">
                            Label
                        </label>
                        <input
                            id="label-input"
                            className="text-input"
                            type="text"
                            placeholder="e.g. Cold Storage · Ledger"
                            value={label}
                            onChange={(e) => setLabel(e.target.value)}
                        />
                    </div>

                    {error && <div className="modal-error">{error}</div>}

                    <div className="modal-actions">
                        <button type="button" className="btn" onClick={onClose}>
                            Cancel
                        </button>
                        <button type="submit" className="btn btn-primary" disabled={submitting}>
                            {submitting ? "Adding…" : "Add Address"}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
