export type RawTransaction = {
    txid: string;
    amountSat: number;
    blockTime: number | null;
    confirmed: boolean;
};
