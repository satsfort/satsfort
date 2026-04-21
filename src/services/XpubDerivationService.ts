import * as bitcoin from "bitcoinjs-lib";
import BIP32Factory from "bip32";
import * as ecc from "tiny-secp256k1";
import bs58check from "bs58check";

// Initialize ECC library for bitcoinjs-lib (required for P2TR/Taproot)
bitcoin.initEccLib(ecc);

// Initialize BIP32 with the secp256k1 library
const bip32 = BIP32Factory(ecc);

// Bitcoin mainnet
const NETWORK = bitcoin.networks.bitcoin;

// Version bytes for different xpub formats (mainnet)
const VERSION_BYTES = {
    xpub: { public: 0x0488b21e, private: 0x0488ade4 }, // BIP44 - P2PKH
    ypub: { public: 0x049d7cb2, private: 0x049d7878 }, // BIP49 - P2SH-P2WPKH
    zpub: { public: 0x04b24746, private: 0x04b2430c }, // BIP84 - P2WPKH
};

export type AddressDerivationType = "P2PKH" | "P2SH" | "P2WPKH" | "P2TR";

export type DerivedAddressInfo = {
    address: string;
    derivationPath: string;
    index: number;
};

export class XpubDerivationService {
    /**
     * Derives addresses from an extended public key.
     *
     * @param extendedKey - The extended public key (xpub, ypub, or zpub)
     * @param derivationType - The type of addresses to derive
     * @param count - Number of addresses to derive
     * @param isChange - Whether to derive change addresses (default: false for receive addresses)
     * @returns Array of derived addresses with their paths
     */
    deriveAddressesFromExtendedKey(
        extendedKey: string,
        derivationType: AddressDerivationType,
        count: number,
        isChange = false,
    ): DerivedAddressInfo[] {
        // Convert to standard xpub format for bip32 library
        const xpub = this.convertToXpub(extendedKey);

        // Parse the xpub
        const node = bip32.fromBase58(xpub, NETWORK);

        // The xpub is at the account level (m/purpose'/coin'/account')
        // Derive from the external (0) or internal/change (1) chain
        const chainIndex = isChange ? 1 : 0;
        const chainNode = node.derive(chainIndex);

        const purpose = this.getBipPurpose(derivationType);
        const addresses: DerivedAddressInfo[] = [];

        for (let i = 0; i < count; i++) {
            const childNode = chainNode.derive(i);
            const address = this.deriveAddress(childNode.publicKey, derivationType);

            addresses.push({
                address,
                derivationPath: `m/${purpose}'/0'/0'/${chainIndex}/${i}`,
                index: i,
            });
        }

        return addresses;
    }

    /** Validates that an extended public key can be parsed and used for derivation. */
    validateExtendedKey(extendedKey: string): string | null {
        try {
            const xpub = this.convertToXpub(extendedKey);
            bip32.fromBase58(xpub, NETWORK);
            return null;
        } catch (err) {
            if (err instanceof Error) {
                return `Invalid extended public key: ${err.message}`;
            }
            return "Invalid extended public key";
        }
    }

    /**
     * Converts any xpub format (xpub, ypub, zpub) to standard xpub format
     * so it can be used with bip32 library.
     */
    private convertToXpub(extendedKey: string): string {
        const decoded = bs58check.decode(extendedKey);
        const version = this.readUInt32BE(decoded, 0);

        // Check if it's already xpub
        if (version === VERSION_BYTES.xpub.public) {
            return extendedKey;
        }

        // Replace the first 4 version bytes with the xpub version bytes
        const xpubVersionBytes = this.uint32BEToBytes(VERSION_BYTES.xpub.public);
        const converted = this.concatBytes(xpubVersionBytes, decoded.slice(4));
        return bs58check.encode(converted);
    }

    /** Derives an address from a public key based on the derivation type. */
    private deriveAddress(publicKey: Uint8Array, derivationType: AddressDerivationType): string {
        switch (derivationType) {
            case "P2PKH":
                return this.deriveP2PKHAddress(publicKey);
            case "P2SH":
                return this.deriveP2SHAddress(publicKey);
            case "P2WPKH":
                return this.deriveP2WPKHAddress(publicKey);
            case "P2TR":
                return this.deriveP2TRAddress(publicKey);
        }
    }

    /** Derives a P2PKH (Legacy) address from a public key. Addresses start with '1'. */
    private deriveP2PKHAddress(publicKey: Uint8Array): string {
        const { address } = bitcoin.payments.p2pkh({ pubkey: publicKey, network: NETWORK });
        if (!address) throw new Error("Failed to derive P2PKH address");
        return address;
    }

    /** Derives a P2SH-P2WPKH (Nested SegWit) address from a public key. Addresses start with '3'. */
    private deriveP2SHAddress(publicKey: Uint8Array): string {
        const p2wpkh = bitcoin.payments.p2wpkh({ pubkey: publicKey, network: NETWORK });
        const { address } = bitcoin.payments.p2sh({ redeem: p2wpkh, network: NETWORK });
        if (!address) throw new Error("Failed to derive P2SH address");
        return address;
    }

    /** Derives a P2WPKH (Native SegWit) address from a public key. Addresses start with 'bc1q'. */
    private deriveP2WPKHAddress(publicKey: Uint8Array): string {
        const { address } = bitcoin.payments.p2wpkh({ pubkey: publicKey, network: NETWORK });
        if (!address) throw new Error("Failed to derive P2WPKH address");
        return address;
    }

    /** Derives a P2TR (Taproot) address from a public key. Addresses start with 'bc1p'. */
    private deriveP2TRAddress(publicKey: Uint8Array): string {
        // For Taproot we need the x-only public key (32 bytes, drop the parity prefix byte)
        const xOnlyPubkey = publicKey.slice(1, 33);
        const { address } = bitcoin.payments.p2tr({ internalPubkey: xOnlyPubkey, network: NETWORK });
        if (!address) throw new Error("Failed to derive P2TR address");
        return address;
    }

    /** Gets the BIP purpose number for a derivation type. */
    private getBipPurpose(derivationType: AddressDerivationType): number {
        switch (derivationType) {
            case "P2PKH":
                return 44;
            case "P2SH":
                return 49;
            case "P2WPKH":
                return 84;
            case "P2TR":
                return 86;
        }
    }

    /** Reads a big-endian uint32 from a Uint8Array at a given offset (browser-safe). */
    private readUInt32BE(bytes: Uint8Array, offset: number): number {
        return ((bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3]) >>> 0;
    }

    /** Writes a big-endian uint32 into a new 4-byte Uint8Array (browser-safe). */
    private uint32BEToBytes(value: number): Uint8Array {
        return new Uint8Array([(value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff]);
    }

    /** Concatenates two Uint8Arrays (browser-safe, no Buffer). */
    private concatBytes(a: Uint8Array, b: Uint8Array): Uint8Array {
        const result = new Uint8Array(a.length + b.length);
        result.set(a, 0);
        result.set(b, a.length);
        return result;
    }
}
