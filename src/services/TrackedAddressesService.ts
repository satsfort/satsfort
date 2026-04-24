import { TrackedAddressesRequests } from "../requests/TrackedAddressesRequests";
import type { TrackedAddressMeta } from "../requests/TrackedAddressesRequests";
import { AddressBalanceService } from "./AddressBalanceService";

export type TrackedAddress = TrackedAddressMeta & {
    btc: number;
    txCount: number;
};

export class TrackedAddressesService {
    private readonly trackedAddressesRequests = new TrackedAddressesRequests();
    private readonly addressBalanceService = new AddressBalanceService();

    async execute(): Promise<TrackedAddress[]> {
        const metas = await this.trackedAddressesRequests.execute();
        const balances = await this.addressBalanceService.getAll(metas.map((meta) => meta.address));
        return metas.map((meta, i) => ({
            ...meta,
            btc: balances[i].btc,
            txCount: balances[i].txCount,
        }));
    }
}
