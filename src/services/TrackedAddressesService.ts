import { TrackedAddressesRequests } from "../requests/TrackedAddressesRequests";
import type { TrackedAddressMeta } from "./model/TrackedAddressMeta";
import type { TrackedAddress } from "./model/TrackedAddress";
import { AddressBalanceService } from "./AddressBalanceService";
import { BitcoinAddressValidationService } from "./BitcoinAddressValidationService";
import { TransactionHistoryService } from "./TransactionHistoryService";

export class TrackedAddressesService {
    private readonly trackedAddressesRequests = new TrackedAddressesRequests();
    private readonly addressBalanceService = new AddressBalanceService();
    private readonly bitcoinAddressValidationService = new BitcoinAddressValidationService();
    private readonly transactionHistoryService = new TransactionHistoryService();

    async getAll(): Promise<TrackedAddress[]> {
        const metas = await this.trackedAddressesRequests.getAll();
        const balances = await this.addressBalanceService.getAll(metas.map((meta) => meta.address));
        return metas.map((meta, i) => ({
            ...meta,
            btc: balances[i].btc,
            txCount: balances[i].txCount,
        }));
    }

    async add(address: string, label: string): Promise<TrackedAddressMeta> {
        const trimmedAddress = address.trim();
        const trimmedLabel = label.trim();

        const error = await this.bitcoinAddressValidationService.validateBitcoinAddress(trimmedAddress);
        if (error) throw new Error(error);

        if (trimmedLabel.length === 0) throw new Error("Label is required");

        const existing = await this.trackedAddressesRequests.findByAddress(trimmedAddress);
        if (existing) throw new Error("This address is already being tracked");

        const type = this.bitcoinAddressValidationService.detectAddressType(trimmedAddress);

        const inserted = await this.trackedAddressesRequests.insert({
            uuid: crypto.randomUUID(),
            label: trimmedLabel,
            address: trimmedAddress,
            type,
        });

        try {
            await this.transactionHistoryService.ingestForAddress(inserted.id, inserted.address);
        } catch (err) {
            console.warn("Failed to ingest transactions for new address", err);
        }

        return inserted;
    }

    async remove(id: string): Promise<void> {
        await this.transactionHistoryService.deleteForAddress(id);
        await this.trackedAddressesRequests.remove(id);
    }
}
