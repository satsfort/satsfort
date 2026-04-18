import { Config } from "../lib/Config";

export type AddressType = "Taproot" | "Segwit" | "Legacy";

export type TrackedAddressMeta = {
  id: string;
  label: string;
  address: string;
  type: AddressType;
  added: string;
  xpub?: boolean;
};

const MOCK_ADDRESSES: TrackedAddressMeta[] = [
  {
    id: "a1",
    label: "Cold Storage · Coldcard Mk4",
    address: "bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh",
    type: "Segwit",
    added: "2024-05-02",
    xpub: true,
  },
  {
    id: "a2",
    label: "Savings · Jade",
    address: "bc1pqqqsyqcyq5rqwzqfpg9scrgwpugpzysnzs23v9ccrydpk8qarc0sj9hjuh",
    type: "Taproot",
    added: "2024-09-14",
  },
  {
    id: "a3",
    label: "Hot Wallet · Strike",
    address: "bc1q34aq5drpuwy3wgl9lhup9892qp6svr8ldzyy7c",
    type: "Segwit",
    added: "2025-01-10",
  },
  {
    id: "a4",
    label: "Legacy Stack",
    address: "1F1tAaz5x1HUXrCNLbtMDqcw6o5GNn4xqX",
    type: "Legacy",
    added: "2024-04-18",
  },
  {
    id: "a5",
    label: "Lightning Collateral",
    address: "bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq",
    type: "Segwit",
    added: "2025-07-22",
  },
];

// In-memory store for user-added addresses
const userAddresses: TrackedAddressMeta[] = [];

let nextId = 1;

/** Detect the address type from its prefix. */
export function detectAddressType(address: string): AddressType {
  if (address.startsWith("bc1p")) return "Taproot";
  if (address.startsWith("bc1q")) return "Segwit";
  // Legacy: starts with 1 or 3
  return "Legacy";
}

/**
 * Validates a Bitcoin mainnet address format with checksum verification.
 * Returns null if valid, or an error message string if invalid.
 */
export async function validateBitcoinAddress(address: string): Promise<string | null> {
  const trimmed = address.trim();
  if (trimmed.length === 0) return "Address is required";

  if (trimmed.startsWith("bc1")) {
    return validateBech32Address(trimmed);
  }

  if (trimmed.startsWith("1") || trimmed.startsWith("3")) {
    return validateBase58Address(trimmed);
  }

  return "Address must start with bc1, 1, or 3 for Bitcoin mainnet";
}

// ── Bech32 / Bech32m validation ──

const BECH32_CHARSET = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";

function bech32Polymod(values: number[]): number {
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

function bech32HrpExpand(hrp: string): number[] {
  const ret: number[] = [];
  for (let i = 0; i < hrp.length; i++) ret.push(hrp.charCodeAt(i) >> 5);
  ret.push(0);
  for (let i = 0; i < hrp.length; i++) ret.push(hrp.charCodeAt(i) & 31);
  return ret;
}

function bech32Verify(hrp: string, data: number[]): "bech32" | "bech32m" | null {
  const poly = bech32Polymod([...bech32HrpExpand(hrp), ...data]);
  if (poly === 1) return "bech32";
  if (poly === 0x2bc830a3) return "bech32m";
  return null;
}

function validateBech32Address(address: string): string | null {
  // Must be all lowercase or all uppercase (but not mixed)
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

  const encoding = bech32Verify(hrp, data);
  if (encoding === null) return "Invalid Bech32 checksum";

  // Witness version is the first data byte
  const witnessVersion = data[0];
  // Decode witness program length from the remaining data (minus 6-char checksum)
  const programData = data.slice(1, data.length - 6);

  // Convert from 5-bit to 8-bit
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
  // Check padding bits are zero
  if (bits > 4 || ((acc << (8 - bits)) & 0xff) !== 0) {
    return "Invalid Bech32 padding bits";
  }

  // Validate witness version and program length per BIP141/BIP350
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

const BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

function decodeBase58(str: string): Uint8Array | null {
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
  // Leading '1's → leading zero bytes
  for (const c of str) {
    if (c !== "1") break;
    bytes.push(0);
  }
  return new Uint8Array(bytes.reverse());
}

async function sha256(data: Uint8Array): Promise<Uint8Array> {
  const buf = await crypto.subtle.digest("SHA-256", data);
  return new Uint8Array(buf);
}

async function validateBase58Address(address: string): Promise<string | null> {
  if (address.length < 25 || address.length > 34) {
    return "Base58 address must be 25–34 characters";
  }

  const decoded = decodeBase58(address);
  if (!decoded) return "Invalid Base58 character in address";
  if (decoded.length !== 25) return "Invalid Base58Check address length";

  const payload = decoded.slice(0, 21);
  const checksum = decoded.slice(21, 25);

  const hash1 = await sha256(payload);
  const hash2 = await sha256(hash1);

  for (let i = 0; i < 4; i++) {
    if (hash2[i] !== checksum[i]) return "Invalid Base58Check checksum";
  }

  const version = decoded[0];
  if (version !== 0x00 && version !== 0x05) {
    return "Invalid address version byte (expected mainnet P2PKH or P2SH)";
  }

  return null;
}


export class TrackedAddressesRequests {
  async execute(): Promise<TrackedAddressMeta[]> {
    if (Config.useMockData) {
      return [...MOCK_ADDRESSES, ...userAddresses];
    }
    return [...userAddresses];
  }

  async add(address: string, label: string): Promise<TrackedAddressMeta> {
    const trimmedAddress = address.trim();
    const trimmedLabel = label.trim();

    const error = await validateBitcoinAddress(trimmedAddress);
    if (error) throw new Error(error);

    if (trimmedLabel.length === 0) throw new Error("Label is required");

    // Check for duplicates
    const all = Config.useMockData
      ? [...MOCK_ADDRESSES, ...userAddresses]
      : [...userAddresses];
    if (all.some((a) => a.address === trimmedAddress)) {
      throw new Error("This address is already being tracked");
    }

    const meta: TrackedAddressMeta = {
      id: `user-${nextId++}`,
      label: trimmedLabel,
      address: trimmedAddress,
      type: detectAddressType(trimmedAddress),
      added: new Date().toISOString().slice(0, 10),
    };

    userAddresses.push(meta);
    return meta;
  }

  async remove(id: string): Promise<void> {
    const index = userAddresses.findIndex((a) => a.id === id);
    if (index !== -1) {
      userAddresses.splice(index, 1);
    }
  }
}
