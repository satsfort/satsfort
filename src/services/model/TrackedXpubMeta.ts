import type { AddressDerivationType as DerivationType } from "../XpubDerivationService";

export type TrackedXpubMeta = {
    id: string;
    label: string;
    xpub: string;
    derivationType: DerivationType;
    added: string;
    addressCount: number;
};
