export type Transaction = {
    id: string;
    txid: string | null;
    date: string;
    type: "buy" | "transfer";
    amount: number;
    source: string;
};
