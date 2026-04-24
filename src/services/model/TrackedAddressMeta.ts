import type { AddressType } from "./AddressType";

export type TrackedAddressMeta = {
    id: string;
    label: string;
    address: string;
    type: AddressType;
    added: string;
    xpub?: boolean;
};
