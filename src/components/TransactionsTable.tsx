import "./TransactionsTable.css";
import { openUrl } from "@tauri-apps/plugin-opener";
import { ExternalLinkIcon } from "./icons";
import type { Transaction } from "../services/model/Transaction";
import { formatAmount, formatSecondary, type Unit } from "../lib/format";
import type { Denomination, FiatCurrency } from "../lib/SettingsContext";

type Props = {
    transactions: Transaction[];
    unit: Unit;
    priceUsd: number;
    currency: FiatCurrency;
    denomination: Denomination;
    error?: string | null;
    emptyMessage?: string;
    showSourceColumn?: boolean;
};

export function TransactionsTable({
    transactions,
    unit,
    priceUsd,
    currency,
    denomination,
    error = null,
    emptyMessage = "No transactions yet.",
    showSourceColumn = true,
}: Props) {
    return (
        <div className={`tx-table ${showSourceColumn ? "" : "tx-table-no-source"}`}>
            <div className="tx-row head">
                <div>Type</div>
                <div>Date</div>
                <div>Amount</div>
                {showSourceColumn && <div className="tx-hide-sm">Source</div>}
                <div className="tx-hide-sm">{unit === "BTC" ? `${currency} Value` : "BTC"}</div>
                <div className="tx-link-cell" />
            </div>
            {error ? (
                <div className="tx-row tx-error mono" role="alert">
                    Failed to load transactions: {error}
                </div>
            ) : transactions.length === 0 ? (
                <div className="tx-row tx-empty muted mono">{emptyMessage}</div>
            ) : (
                transactions.map((tx) => (
                    <div className="tx-row" key={tx.id}>
                        <div>
                            <span className={`tx-tag ${tx.type}`}>{tx.type}</span>
                        </div>
                        <div>{tx.date}</div>
                        <div className="tx-amount">
                            <span className={tx.type === "sell" ? "minus" : "plus"}>{tx.type === "sell" ? "−" : "+"}</span>
                            {formatAmount(tx.amount, unit, priceUsd, {
                                btcDigits: 6,
                                fiat: currency,
                                denom: denomination,
                            })}
                        </div>
                        {showSourceColumn && <div className="tx-hide-sm muted">{tx.source}</div>}
                        <div className="tx-hide-sm">{formatSecondary(tx.amount, unit, priceUsd, currency, denomination)}</div>
                        <div className="tx-link-cell">
                            {tx.txid && (
                                <button
                                    type="button"
                                    className="link-btn tx-link-btn"
                                    title="View on mempool.space"
                                    aria-label="View on mempool.space"
                                    onClick={() => void openUrl(`https://mempool.space/tx/${tx.txid}`)}
                                >
                                    <ExternalLinkIcon size={14} />
                                </button>
                            )}
                        </div>
                    </div>
                ))
            )}
        </div>
    );
}
