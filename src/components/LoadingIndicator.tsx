import { useEffect, useState } from "react";

const STATUSES = ["DECRYPTING_LEDGER", "SYNCING_NODE", "HASHING_BLOCKS", "VERIFYING_UTXO", "ESTABLISHING_LINK", "SCANNING_MEMPOOL"];

export function LoadingIndicator() {
    const [i, setI] = useState(0);

    useEffect(() => {
        const id = setInterval(() => setI((n) => (n + 1) % STATUSES.length), 900);
        return () => clearInterval(id);
    }, []);

    const status = STATUSES[i];

    return (
        <div className="loading-cyber mono">
            <div className="loading-bar" aria-hidden>
                <div className="loading-bar-fill" />
            </div>
            <div className="loading-status" role="status" aria-live="polite">
                <span className="loading-prompt">&gt;</span>
                <span className="loading-text" data-text={status}>
                    {status}
                </span>
                <span className="loading-cursor">█</span>
            </div>
        </div>
    );
}
