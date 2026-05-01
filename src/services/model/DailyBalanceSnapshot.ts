/**
 * One end-of-day balance snapshot synthesized from confirmed transactions.
 * `fetchedAt` is the end of the UTC day so multiple snapshots within a day
 * collapse to a single representative point in time.
 */
export type DailyBalanceSnapshot = {
    date: string;
    balanceBtc: number;
    balanceUsd: number;
    txCount: number;
    fetchedAt: string;
};
