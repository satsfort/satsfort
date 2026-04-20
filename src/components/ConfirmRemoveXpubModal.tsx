type ConfirmRemoveXpubModalProps = {
    label: string;
    addressCount: number;
    onClose: () => void;
    onConfirm: () => Promise<void> | void;
};

export function ConfirmRemoveXpubModal({ label, addressCount, onClose, onConfirm }: ConfirmRemoveXpubModalProps) {
    const handleConfirm = () => {
        void Promise.resolve(onConfirm()).then(onClose);
    };

    return (
        <div className="modal-backdrop" onClick={onClose}>
            <div className="modal-card" onClick={(e) => e.stopPropagation()}>
                <div className="modal-head">
                    <h2 className="modal-title">Remove Extended Public Key</h2>
                    <button className="modal-close" onClick={onClose} aria-label="Close">
                        ×
                    </button>
                </div>

                <div className="modal-body">
                    <p style={{ margin: 0 }}>
                        Are you sure you want to remove <strong>{label}</strong> and all <strong>{addressCount}</strong> derived
                        addresses?
                    </p>
                    <p className="small muted" style={{ margin: "0.5rem 0 0" }}>
                        This action cannot be undone. You will need to re-import the xpub to track these addresses again.
                    </p>

                    <div className="modal-actions">
                        <button type="button" className="btn" onClick={onClose}>
                            Cancel
                        </button>
                        <button type="button" className="btn btn-danger" onClick={handleConfirm}>
                            Remove
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

