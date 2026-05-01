export type Transaction = {
    id: string;
    txid: string | null;
    date: string;
    type: "buy" | "sell";
    amount: number;
    source: string;
};
