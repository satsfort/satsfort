import { XpubRequests } from "../requests/XpubRequests";
import type { TrackedXpubMeta } from "./model/TrackedXpubMeta";
import type { DerivedAddress } from "./model/DerivedAddress";
import type { AddressDerivationType } from "./model/AddressDerivationType";
import { XpubDerivationService } from "./XpubDerivationService";
import { TransactionHistoryService } from "./TransactionHistoryService";

const ADDRESS_DERIVATION_COUNT = 20;

const VALID_PREFIXES = ["xpub", "ypub", "zpub", "tpub", "upub", "vpub"];
const TESTNET_PREFIXES = ["tpub", "upub", "vpub"];
const BASE58_CHARS = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

export class XpubService {
    private readonly xpubRequests = new XpubRequests();
    private readonly xpubDerivationService = new XpubDerivationService();
    private readonly transactionHistoryService = new TransactionHistoryService();

    /** Validates an xpub/zpub/ypub format. Returns null if valid, or an error message string if invalid. */
    validateXpub(xpub: string): string | null {
        const trimmed = xpub.trim();
        if (trimmed.length === 0) return "Extended public key is required";

        const prefix = trimmed.slice(0, 4);
        if (!VALID_PREFIXES.includes(prefix)) {
            return "Extended public key must start with xpub, ypub, zpub (mainnet) or tpub, upub, vpub (testnet)";
        }
        if (TESTNET_PREFIXES.includes(prefix)) {
            return "Testnet extended public keys are not supported. Please use a mainnet key (xpub, ypub, or zpub)";
        }
        if (trimmed.length < 100 || trimmed.length > 120) {
            return "Extended public key has invalid length";
        }
        for (const char of trimmed) {
            if (!BASE58_CHARS.includes(char)) {
                return `Invalid character in extended public key: '${char}'`;
            }
        }

        const derivationError = this.xpubDerivationService.validateExtendedKey(trimmed);
        if (derivationError) return derivationError;

        return null;
    }

    /** Default address derivation type based on the xpub prefix. */
    getDefaultDerivationType(xpub: string): AddressDerivationType {
        const prefix = xpub.trim().slice(0, 4);
        switch (prefix) {
            case "zpub":
                return "P2WPKH";
            case "ypub":
                return "P2SH";
            case "xpub":
            default:
                return "P2PKH";
        }
    }

    getAll(): Promise<TrackedXpubMeta[]> {
        return this.xpubRequests.getAll();
    }

    getDerivedAddresses(xpubId: string): Promise<DerivedAddress[]> {
        return this.xpubRequests.getDerivedAddresses(xpubId);
    }

    getAllDerivedAddresses(): Promise<DerivedAddress[]> {
        return this.xpubRequests.getAllDerivedAddresses();
    }

    async add(
        xpub: string,
        label: string,
        derivationType: AddressDerivationType,
    ): Promise<{ xpub: TrackedXpubMeta; addresses: DerivedAddress[] }> {
        const trimmedXpub = xpub.trim();
        const trimmedLabel = label.trim();

        const error = this.validateXpub(trimmedXpub);
        if (error) throw new Error(error);

        if (trimmedLabel.length === 0) throw new Error("Label is required");

        const existing = await this.xpubRequests.findByXpub(trimmedXpub);
        if (existing) throw new Error("This extended public key is already being tracked");

        const xpubMeta = await this.xpubRequests.insertXpub({
            uuid: crypto.randomUUID(),
            label: trimmedLabel,
            xpub: trimmedXpub,
            derivationType,
            addressCount: ADDRESS_DERIVATION_COUNT,
        });

        const internalId = await this.xpubRequests.findInternalIdByUuid(xpubMeta.id);
        if (internalId === null) throw new Error("Failed to locate inserted xpub");

        const derivedInfos = this.xpubDerivationService.deriveAddressesFromExtendedKey(
            trimmedXpub,
            derivationType,
            ADDRESS_DERIVATION_COUNT,
        );
        const derivedAddresses: DerivedAddress[] = [];
        for (const info of derivedInfos) {
            const derived = await this.xpubRequests.insertDerivedAddress(internalId, {
                uuid: crypto.randomUUID(),
                xpubUuid: xpubMeta.id,
                address: info.address,
                derivationPath: info.derivationPath,
                index: info.index,
            });
            derivedAddresses.push(derived);
        }

        try {
            await this.transactionHistoryService.ingestForXpub(xpubMeta.id);
        } catch (err) {
            console.error("Failed to ingest transactions for new xpub", err);
            throw err;
        }

        return { xpub: xpubMeta, addresses: derivedAddresses };
    }

    async remove(id: string): Promise<void> {
        await this.transactionHistoryService.deleteForXpub(id);
        await this.xpubRequests.remove(id);
    }

    async saveBalance(id: string): Promise<{ btc: number; usd: number; txCount: number }> {
        const internalId = await this.xpubRequests.findInternalIdByUuid(id);
        if (internalId === null) throw new Error("xpub not found");

        const totals = await this.xpubRequests.sumDerivedBalances(internalId);
        const fetchedAt = new Date().toISOString();
        const update = { ...totals, fetchedAt };
        await this.xpubRequests.updateLatestBalance(internalId, update);
        await this.xpubRequests.insertBalanceSnapshot(internalId, update);

        return totals;
    }
}
