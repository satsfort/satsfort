import { useState } from "react";
import "./Modal.css";
import type { AddressDerivationType } from "../services/XpubDerivationService";
import { XpubService } from "../services/XpubService";
import { useEscapeKey } from "../lib/useEscapeKey";

const xpubService = new XpubService();

type ImportXpubModalProps = {
    onClose: () => void;
    onImport: (xpub: string, label: string, derivationType: AddressDerivationType) => Promise<void>;
};

const DERIVATION_TYPE_OPTIONS: { value: AddressDerivationType; label: string; description: string }[] = [
    { value: "P2WPKH", label: "Native SegWit (P2WPKH)", description: "bc1q... addresses — Recommended" },
    { value: "P2TR", label: "Taproot (P2TR)", description: "bc1p... addresses" },
    { value: "P2SH", label: "Wrapped SegWit (P2SH)", description: "3... addresses" },
    { value: "P2PKH", label: "Legacy (P2PKH)", description: "1... addresses" },
];

export function ImportXpubModal({ onClose, onImport }: ImportXpubModalProps) {
    useEscapeKey(onClose);
    const [xpub, setXpub] = useState("");
    const [label, setLabel] = useState("");
    const [derivationType, setDerivationType] = useState<AddressDerivationType>("P2WPKH");
    const [error, setError] = useState<string | null>(null);
    const [submitting, setSubmitting] = useState(false);

    const handleXpubChange = (value: string) => {
        setXpub(value);
        // Auto-detect derivation type based on prefix
        if (value.trim().length >= 4) {
            setDerivationType(xpubService.getDefaultDerivationType(value));
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);

        const validationError = xpubService.validateXpub(xpub);
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
            await onImport(xpub, label, derivationType);
            onClose();
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to import xpub");
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="modal-backdrop" onClick={onClose}>
            <div className="modal-card" onClick={(e) => e.stopPropagation()}>
                <div className="modal-head">
                    <h2 className="modal-title">Import Extended Public Key</h2>
                    <button className="modal-close" onClick={onClose} aria-label="Close">
                        ×
                    </button>
                </div>

                <form className="modal-body" onSubmit={(e) => void handleSubmit(e)}>
                    <div className="modal-field">
                        <label className="modal-label" htmlFor="xpub-input">
                            xpub / zpub / ypub
                        </label>
                        <textarea
                            id="xpub-input"
                            className="text-input mono"
                            placeholder="zpub6rFR7y4Q2Aij..."
                            value={xpub}
                            onChange={(e) => handleXpubChange(e.target.value)}
                            spellCheck={false}
                            autoFocus
                            rows={3}
                            style={{ resize: "vertical", minHeight: "4.5rem" }}
                        />
                        <span className="small muted">
                            Paste your extended public key. The first 20 addresses will be derived and monitored.
                        </span>
                    </div>

                    <div className="modal-field">
                        <label className="modal-label" htmlFor="label-input">
                            Label
                        </label>
                        <input
                            id="label-input"
                            className="text-input"
                            type="text"
                            placeholder="e.g. Hardware Wallet · Ledger"
                            value={label}
                            onChange={(e) => setLabel(e.target.value)}
                        />
                    </div>

                    <div className="modal-field">
                        <label className="modal-label" htmlFor="derivation-type">
                            Address Type
                        </label>
                        <select
                            id="derivation-type"
                            className="text-input"
                            value={derivationType}
                            onChange={(e) => setDerivationType(e.target.value as AddressDerivationType)}
                        >
                            {DERIVATION_TYPE_OPTIONS.map((opt) => (
                                <option key={opt.value} value={opt.value}>
                                    {opt.label}
                                </option>
                            ))}
                        </select>
                        <span className="small muted">{DERIVATION_TYPE_OPTIONS.find((o) => o.value === derivationType)?.description}</span>
                    </div>

                    {error && <div className="modal-error">{error}</div>}

                    <div className="modal-actions">
                        <button type="button" className="btn" onClick={onClose}>
                            Cancel
                        </button>
                        <button type="submit" className="btn btn-primary" disabled={submitting}>
                            {submitting ? "Importing…" : "Import xpub"}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
