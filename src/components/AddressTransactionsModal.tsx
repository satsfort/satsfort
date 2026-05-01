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

type Props = {
    addressUuid: string;
    label: string;
    address: string;
    unit: Unit;
    priceUsd: number;
    currency: FiatCurrency;
    denomination: Denomination;
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
    onClose,
}: Props) {
    useEscapeKey(onClose);
    const [transactions, setTransactions] = useState<Transaction[] | null>(null);
    const [total, setTotal] = useState<number | null>(null);
    const [page, setPage] = useState(0);
    const [error, setError] = useState<string | null>(null);
    const [loadingPage, setLoadingPage] = useState(false);

    useEffect(() => {
        let cancelled = false;
        const service = new TransactionHistoryService();
        setLoadingPage(true);
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
                if (!cancelled) setLoadingPage(false);
            });
        return () => {
            cancelled = true;
        };
    }, [addressUuid, page]);

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
                    {transactions === null ? (
                        <LoadingIndicator />
                    ) : (
                        <>
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
