import "./Modal.css";
import { useEscapeKey } from "../lib/useEscapeKey";
import { ZapIcon } from "./icons";

type Props = {
    title: string;
    message: string;
    onClose: () => void;
    onUpgrade: () => void;
};

export function PremiumLimitModal({ title, message, onClose, onUpgrade }: Props) {
    useEscapeKey(onClose);

    const handleUpgrade = () => {
        onUpgrade();
        onClose();
    };

    return (
        <div className="modal-backdrop" onClick={onClose}>
            <div className="modal-card" onClick={(event) => event.stopPropagation()}>
                <div className="modal-head">
                    <h2 className="modal-title">{title}</h2>
                    <button className="modal-close" onClick={onClose} aria-label="Close">
                        x
                    </button>
                </div>

                <div className="modal-body">
                    <p style={{ margin: 0 }}>{message}</p>
                    <p className="small muted" style={{ margin: "0.25rem 0 0" }}>
                        Upgrade for unlimited addresses and xpubs, encrypted cloud backups, custom node connections, and more.
                    </p>

                    <div className="modal-actions">
                        <button type="button" className="btn" onClick={onClose}>
                            Not now
                        </button>
                        <button type="button" className="btn btn-primary btn-with-icon" onClick={handleUpgrade} autoFocus>
                            <ZapIcon size={14} />
                            Upgrade
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
