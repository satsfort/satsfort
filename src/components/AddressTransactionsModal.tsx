import { useEffect, useState } from "react";
import "./Modal.css";
import "./AddressTransactionsModal.css";
import { useEscapeKey } from "../lib/useEscapeKey";
import { TransactionHistoryService } from "../services/TransactionHistoryService";
import type { Transaction } from "../services/model/Transaction";
import type { Unit } from "../lib/format";
import type { Denomination, FiatCurrency } from "../lib/SettingsContext";
import { TransactionsTable } from "./TransactionsTable";
import { LoadingIndicator } from "./LoadingIndicator";
import { SpinnerIcon } from "./icons";

type Props = {
    addressUuid: string;
    label: string;
    address: string;
    unit: Unit;
    priceUsd: number;
    currency: FiatCurrency;
    denomination: Denomination;
    /**
     * When set, ingestion is in flight for this address. The modal shows a
     * progress banner and re-fetches the current page each time the count
     * advances meaningfully, plus once when ingestion finishes (status
     * transitions from set to null).
     */
    syncStatus: { txCount: number } | null;
    onClose: () => void;
};

const PAGE_SIZE = 25;

export function AddressTransactionsModal({
    addressUuid,
    label,
    address,
    unit,
    priceUsd,
    currency,
    denomination,
    syncStatus,
    onClose,
}: Props) {
    useEscapeKey(onClose);
    const [transactions, setTransactions] = useState<Transaction[] | null>(null);
    const [total, setTotal] = useState<number | null>(null);
    const [page, setPage] = useState(0);
    const [error, setError] = useState<string | null>(null);
    const [loadedKey, setLoadedKey] = useState<string | null>(null);

    // Persistence is atomic at end-of-sync, so refetch only when sync finishes
    // (the table has nothing new to show until then).
    const isSyncing = syncStatus !== null;
    const refetchKey = isSyncing ? "syncing" : "done";
    // Derived loading flag: the current request differs from the last one we
    // finished. Avoids a synchronous setState inside the effect body, which
    // React flags as a cascading render.
    const requestKey = `${addressUuid}|${page}|${refetchKey}`;
    const loadingPage = loadedKey !== requestKey;

    useEffect(() => {
        let cancelled = false;
        const service = new TransactionHistoryService();
        Promise.all([service.countForAddress(addressUuid), service.getForAddress(addressUuid, PAGE_SIZE, page * PAGE_SIZE)])
            .then(([count, txs]) => {
                if (cancelled) return;
                setTotal(count);
                setTransactions(txs);
                setError(null);
            })
            .catch((err) => {
                if (cancelled) return;
                console.error("Failed to load transactions for address", err);
                setTotal(0);
                setTransactions([]);
                setError(err instanceof Error ? err.message : String(err));
            })
            .finally(() => {
                if (!cancelled) setLoadedKey(requestKey);
            });
        return () => {
            cancelled = true;
        };
    }, [addressUuid, page, refetchKey, requestKey]);

    const totalPages = total === null ? 0 : Math.max(1, Math.ceil(total / PAGE_SIZE));
    const showingFrom = transactions && transactions.length > 0 ? page * PAGE_SIZE + 1 : 0;
    const showingTo = transactions ? page * PAGE_SIZE + transactions.length : 0;

    return (
        <div className="modal-backdrop" onClick={onClose}>
            <div className="modal-card address-tx-modal" onClick={(e) => e.stopPropagation()}>
                <div className="modal-head">
                    <div>
                        <h2 className="modal-title">{label}</h2>
                        <div className="mono small muted address-tx-subtitle">{address}</div>
                    </div>
                    <button className="modal-close" onClick={onClose} aria-label="Close">
                        ×
                    </button>
                </div>

                <div className="modal-body address-tx-body">
                    {syncStatus && (
                        <div className="address-tx-sync" role="status" aria-live="polite">
                            <SpinnerIcon size={14} />
                            <span>
                                Fetching transactions, <strong>{syncStatus.txCount.toLocaleString()}</strong> found so far
                                {syncStatus.txCount >= 500 ? ", this may take a moment" : ""}…
                            </span>
                        </div>
                    )}
                    {transactions === null ? (
                        <LoadingIndicator />
                    ) : (
                        <>
                            <div className="address-tx-table-scroll">
                                <TransactionsTable
                                    transactions={transactions}
                                    unit={unit}
                                    priceUsd={priceUsd}
                                    currency={currency}
                                    denomination={denomination}
                                    error={error}
                                    emptyMessage="No transactions for this address yet."
                                    showSourceColumn={false}
                                />
                            </div>
                            {!error && total !== null && total > 0 && (
                                <div className="address-tx-pager">
                                    <span className="small muted mono">
                                        {showingFrom}–{showingTo} of {total}
                                    </span>
                                    <div className="address-tx-pager-controls">
                                        <button
                                            type="button"
                                            className="btn"
                                            onClick={() => setPage((p) => Math.max(0, p - 1))}
                                            disabled={page === 0 || loadingPage}
                                        >
                                            ‹ Prev
                                        </button>
                                        <span className="small muted mono">
                                            Page {page + 1} / {totalPages}
                                        </span>
                                        <button
                                            type="button"
                                            className="btn"
                                            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                                            disabled={page >= totalPages - 1 || loadingPage}
                                        >
                                            Next ›
                                        </button>
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
