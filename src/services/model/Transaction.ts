export type Transaction = {
    id: string;
    date: string;
    type: "buy" | "transfer";
    amount: number;
    source: string;
};
