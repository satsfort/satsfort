import type { AddressDerivationType } from "../XpubDerivationService";

export type TrackedXpubMeta = {
    id: string;
    label: string;
    xpub: string;
    derivationType: AddressDerivationType;
    added: string;
    addressCount: number;
};
