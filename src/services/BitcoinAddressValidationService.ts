export type AddressType = "Taproot" | "Segwit" | "Legacy";

const BECH32_CHARSET = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";
const BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

export class BitcoinAddressValidationService {
    /** Detect the address type from its prefix. */
    detectAddressType(address: string): AddressType {
        if (address.startsWith("bc1p")) return "Taproot";
        if (address.startsWith("bc1q")) return "Segwit";
        return "Legacy";
    }

    /**
     * Validates a Bitcoin mainnet address format with checksum verification.
     * Returns null if valid, or an error message string if invalid.
     */
    async validateBitcoinAddress(address: string): Promise<string | null> {
        const trimmed = address.trim();
        if (trimmed.length === 0) return "Address is required";

        if (trimmed.startsWith("bc1")) {
            return this.validateBech32Address(trimmed);
        }

        if (trimmed.startsWith("1") || trimmed.startsWith("3")) {
            return this.validateBase58Address(trimmed);
        }

        return "Address must start with bc1, 1, or 3 for Bitcoin mainnet";
    }

    // ── Bech32 / Bech32m validation ──

    private bech32Polymod(values: number[]): number {
        const GEN = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];
        let chk = 1;
        for (const v of values) {
            const b = chk >> 25;
            chk = ((chk & 0x1ffffff) << 5) ^ v;
            for (let i = 0; i < 5; i++) {
                if ((b >> i) & 1) chk ^= GEN[i];
            }
        }
        return chk;
    }

    private bech32HrpExpand(hrp: string): number[] {
        const ret: number[] = [];
        for (let i = 0; i < hrp.length; i++) ret.push(hrp.charCodeAt(i) >> 5);
        ret.push(0);
        for (let i = 0; i < hrp.length; i++) ret.push(hrp.charCodeAt(i) & 31);
        return ret;
    }

    private bech32Verify(hrp: string, data: number[]): "bech32" | "bech32m" | null {
        const poly = this.bech32Polymod([...this.bech32HrpExpand(hrp), ...data]);
        if (poly === 1) return "bech32";
        if (poly === 0x2bc830a3) return "bech32m";
        return null;
    }

    private validateBech32Address(address: string): string | null {
        if (address !== address.toLowerCase() && address !== address.toUpperCase()) {
            return "Bech32 address must not mix upper and lower case";
        }

        const lower = address.toLowerCase();
        const sepPos = lower.lastIndexOf("1");
        if (sepPos < 1) return "Invalid Bech32 address: missing separator";

        const hrp = lower.slice(0, sepPos);
        const dataChars = lower.slice(sepPos + 1);

        if (hrp !== "bc") return "Only Bitcoin mainnet (bc1) addresses are supported";
        if (dataChars.length < 6) return "Bech32 address data part too short";

        const data: number[] = [];
        for (const c of dataChars) {
            const idx = BECH32_CHARSET.indexOf(c);
            if (idx === -1) return `Invalid Bech32 character: '${c}'`;
            data.push(idx);
        }

        const encoding = this.bech32Verify(hrp, data);
        if (encoding === null) return "Invalid Bech32 checksum";

        const witnessVersion = data[0];
        const programData = data.slice(1, data.length - 6);

        let acc = 0;
        let bits = 0;
        const program: number[] = [];
        for (const v of programData) {
            acc = (acc << 5) | v;
            bits += 5;
            while (bits >= 8) {
                bits -= 8;
                program.push((acc >> bits) & 0xff);
            }
        }
        if (bits > 4 || ((acc << (8 - bits)) & 0xff) !== 0) {
            return "Invalid Bech32 padding bits";
        }

        if (witnessVersion > 16) return "Invalid witness version";

        if (witnessVersion === 0) {
            if (encoding !== "bech32") return "Witness v0 must use Bech32 encoding";
            if (program.length !== 20 && program.length !== 32) {
                return "Witness v0 program must be 20 or 32 bytes";
            }
        } else {
            if (encoding !== "bech32m") return `Witness v${witnessVersion} must use Bech32m encoding`;
            if (program.length < 2 || program.length > 40) {
                return `Witness v${witnessVersion} program must be 2–40 bytes`;
            }
        }

        return null;
    }

    // ── Base58Check validation ──

    private decodeBase58(str: string): Uint8Array | null {
        const bytes: number[] = [];
        for (const c of str) {
            const idx = BASE58_ALPHABET.indexOf(c);
            if (idx === -1) return null;
            let carry = idx;
            for (let j = 0; j < bytes.length; j++) {
                carry += bytes[j] * 58;
                bytes[j] = carry & 0xff;
                carry >>= 8;
            }
            while (carry > 0) {
                bytes.push(carry & 0xff);
                carry >>= 8;
            }
        }
        for (const c of str) {
            if (c !== "1") break;
            bytes.push(0);
        }
        return new Uint8Array(bytes.reverse());
    }

    private async sha256(data: Uint8Array): Promise<Uint8Array> {
        const buf = await crypto.subtle.digest("SHA-256", data);
        return new Uint8Array(buf);
    }

    private async validateBase58Address(address: string): Promise<string | null> {
        if (address.length < 25 || address.length > 34) {
            return "Base58 address must be 25–34 characters";
        }

        const decoded = this.decodeBase58(address);
        if (!decoded) return "Invalid Base58 character in address";
        if (decoded.length !== 25) return "Invalid Base58Check address length";

        const payload = decoded.slice(0, 21);
        const checksum = decoded.slice(21, 25);

        const hash1 = await this.sha256(payload);
        const hash2 = await this.sha256(hash1);

        for (let i = 0; i < 4; i++) {
            if (hash2[i] !== checksum[i]) return "Invalid Base58Check checksum";
        }

        const version = decoded[0];
        if (version !== 0x00 && version !== 0x05) {
            return "Invalid address version byte (expected mainnet P2PKH or P2SH)";
        }

        return null;
    }
}
