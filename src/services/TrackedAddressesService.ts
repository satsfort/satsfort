import { AddressBalanceRequests } from "../requests/AddressBalanceRequests";
import { TrackedAddressesRequests } from "../requests/TrackedAddressesRequests";
import type { TrackedAddressMeta } from "../requests/TrackedAddressesRequests";

export type TrackedAddress = TrackedAddressMeta & {
    btc: number;
    txCount: number;
};

export class TrackedAddressesService {
    async execute(): Promise<TrackedAddress[]> {
        const metas = await new TrackedAddressesRequests().execute();
        const balances = await new AddressBalanceRequests().executeAll(metas.map((meta) => meta.address));
        return metas.map((meta, i) => ({
            ...meta,
            btc: balances[i].btc,
            txCount: balances[i].txCount,
        }));
    }
}
