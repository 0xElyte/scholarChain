const BASE58_ALPHABET =
  "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

const BASE58_INDEX = new Map(
  BASE58_ALPHABET.split("").map((char, index) => [char, index]),
);

function hexToBytes(hex: string): Uint8Array {
  const normalized = hex.replace(/^0x/, "");
  const bytes = new Uint8Array(normalized.length / 2);

  for (let i = 0; i < bytes.length; i += 1) {
    bytes[i] = Number.parseInt(normalized.slice(i * 2, i * 2 + 2), 16);
  }

  return bytes;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function base58Decode(value: string): Uint8Array {
  const trimmed = value.trim();
  if (!trimmed) throw new Error("IPFS reference is required.");

  let accumulator = 0n;
  for (const char of trimmed) {
    const digit = BASE58_INDEX.get(char);
    if (digit === undefined) {
      throw new Error("Unsupported IPFS CID format.");
    }
    accumulator = accumulator * 58n + BigInt(digit);
  }

  let hex = accumulator.toString(16);
  if (hex.length % 2 === 1) hex = `0${hex}`;

  const decoded = hex ? hexToBytes(hex) : new Uint8Array();
  const leadingZeroes = trimmed.match(/^1+/)?.[0].length ?? 0;
  const bytes = new Uint8Array(leadingZeroes + decoded.length);
  bytes.set(decoded, leadingZeroes);
  return bytes;
}

function base58Encode(bytes: Uint8Array): string {
  if (bytes.length === 0) return "";

  let accumulator = 0n;
  for (const byte of bytes) {
    accumulator = (accumulator << 8n) + BigInt(byte);
  }

  let encoded = "";
  while (accumulator > 0n) {
    const remainder = Number(accumulator % 58n);
    encoded = `${BASE58_ALPHABET[remainder]}${encoded}`;
    accumulator /= 58n;
  }

  let leadingZeroes = 0;
  while (leadingZeroes < bytes.length && bytes[leadingZeroes] === 0) {
    leadingZeroes += 1;
  }

  return `${"1".repeat(leadingZeroes)}${encoded}` || "1".repeat(leadingZeroes);
}

export function isBytes32Hex(value: string): boolean {
  return /^0x[0-9a-fA-F]{64}$/.test(value.trim());
}

export function extractIpfsReference(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return "";

  const withoutScheme = trimmed.replace(/^ipfs:\/\//i, "");
  const gatewayMatch = withoutScheme.match(/\/ipfs\/([^/?#]+)/i);
  if (gatewayMatch?.[1]) return gatewayMatch[1];

  return withoutScheme.split(/[/?#]/)[0];
}

export function cidToBytes32(reference: string): string {
  const trimmed = reference.trim();
  if (!trimmed) throw new Error("IPFS reference is required.");
  if (isBytes32Hex(trimmed)) return trimmed.toLowerCase();

  const candidate = extractIpfsReference(trimmed);
  const multihash = base58Decode(candidate);

  if (
    multihash.length !== 34 ||
    multihash[0] !== 0x12 ||
    multihash[1] !== 0x20
  ) {
    throw new Error("Please paste a CIDv0 (Qm...) or a 0x bytes32 reference.");
  }

  return `0x${bytesToHex(multihash.slice(2))}`;
}

export function bytes32ToCid(reference: string): string {
  const trimmed = reference.trim();
  if (!isBytes32Hex(trimmed)) return trimmed;

  const digest = hexToBytes(trimmed);
  const multihash = new Uint8Array(34);
  multihash[0] = 0x12;
  multihash[1] = 0x20;
  multihash.set(digest, 2);

  return base58Encode(multihash);
}

export function ipfsGatewayUrl(reference: string): string {
  const trimmed = reference.trim();
  if (!trimmed) return "";

  const cid = isBytes32Hex(trimmed)
    ? bytes32ToCid(trimmed)
    : extractIpfsReference(trimmed);
  if (!cid) return "";

  return `https://gateway.pinata.cloud/ipfs/${cid}`;
}
