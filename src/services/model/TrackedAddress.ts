import type { TrackedAddressMeta } from "./TrackedAddressMeta";

export type TrackedAddress = TrackedAddressMeta & {
    btc: number;
    txCount: number;
};
