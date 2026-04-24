import { AddressBalanceRequests } from "../requests/AddressBalanceRequests";
import { BlockchainBalanceRequests } from "../requests/BlockchainBalanceRequests";
import { SpotPriceRequests } from "../requests/SpotPriceRequests";
import type { AddressBalance } from "./model/AddressBalance";

export class AddressBalanceService {
    private readonly addressBalanceRequests = new AddressBalanceRequests();
    private readonly blockchainBalanceRequests = new BlockchainBalanceRequests();
    private readonly spotPriceRequests = new SpotPriceRequests();

    async get(address: string, spotUsd?: number): Promise<AddressBalance> {
        const spot = spotUsd ?? (await this.spotPriceRequests.execute()).usd;
        const balance = await this.blockchainBalanceRequests.get(address);
        await this.persistBalance(balance, spot);
        return balance;
    }

    /**
     * Fetches balances for multiple addresses in parallel.
     * Fetches spot price once so every address is valued against the same price.
     */
    async getAll(addresses: string[]): Promise<AddressBalance[]> {
        const spot = (await this.spotPriceRequests.execute()).usd;
        return Promise.all(addresses.map((address) => this.get(address, spot)));
    }

    private async persistBalance(balance: AddressBalance, spotUsd: number): Promise<void> {
        const fetchedAt = new Date().toISOString();
        const update = {
            btc: balance.btc,
            usd: balance.btc * spotUsd,
            txCount: balance.txCount,
            fetchedAt,
        };

        const addressIds = await this.addressBalanceRequests.findAddressIds(balance.address);
        for (const id of addressIds) {
            await this.addressBalanceRequests.updateAddressLatest(id, update);
            await this.addressBalanceRequests.insertAddressBalanceSnapshot(id, update);
        }

        const xpubAddressIds = await this.addressBalanceRequests.findXpubAddressIds(balance.address);
        for (const id of xpubAddressIds) {
            await this.addressBalanceRequests.updateXpubAddressLatest(id, update);
            await this.addressBalanceRequests.insertXpubAddressBalanceSnapshot(id, update);
        }
    }
}
