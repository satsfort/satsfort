import { useState } from "react";

type ConfirmRemoveAddressModalProps = {
  label: string;
  address: string;
  onClose: () => void;
  onConfirm: () => Promise<void>;
};

export function ConfirmRemoveAddressModal({
  label,
  address,
  onClose,
  onConfirm,
}: ConfirmRemoveAddressModalProps) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConfirm = async () => {
    setSubmitting(true);
    setError(null);
    try {
      await onConfirm();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove address");
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2 className="modal-title">Remove address?</h2>
          <button className="modal-close" onClick={onClose} aria-label="Close">×</button>
        </div>

        <div className="modal-body">
          <div>
            <p style={{ margin: 0 }}>
              Stop tracking <strong>{label}</strong>? You can add it again later.
            </p>
            <div className="mono small muted" style={{ marginTop: "0.5rem" }}>{address}</div>
          </div>

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
              {submitting ? "Removing…" : "Remove"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
