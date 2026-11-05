import { createHmac, randomBytes } from 'node:crypto';

/**
 * RFC 6238 TOTP (SHA-1, 6 digits, 30-second period) and RFC 4648 base32.
 *
 * Implemented locally to avoid a dependency for a small, well-specified
 * algorithm. Secrets are 160-bit random values, base32-encoded for authenticator
 * apps; verification accepts one period of clock drift and reports the counter so
 * callers can reject replays.
 */
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const PERIOD_SECONDS = 30;
const DIGITS = 6;
const SECRET_BYTES = 20;

export function base32Encode(buffer: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = '';
  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    output += ALPHABET[(value << (5 - bits)) & 31];
  }
  return output;
}

export function base32Decode(value: string): Buffer {
  const normalized = value.toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = 0;
  let current = 0;
  const bytes: number[] = [];
  for (const character of normalized) {
    const index = ALPHABET.indexOf(character);
    if (index < 0) continue;
    current = (current << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((current >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

export function generateTotpSecret(): string {
  return base32Encode(randomBytes(SECRET_BYTES));
}

export function totpCounter(timestampMs: number): number {
  return Math.floor(timestampMs / (PERIOD_SECONDS * 1000));
}

/** Generate the six-digit code for a timestamp (used by tests and the UI). */
export function generateTotp(secret: string, timestampMs = Date.now()): string {
  return generateTotpForCounter(secret, totpCounter(timestampMs));
}

function generateTotpForCounter(secret: string, counter: number): string {
  const key = base32Decode(secret);
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac('sha1', key).update(buffer).digest();
  const offset = digest[digest.length - 1]! & 0x0f;
  const binary =
    ((digest[offset]! & 0x7f) << 24) |
    ((digest[offset + 1]! & 0xff) << 16) |
    ((digest[offset + 2]! & 0xff) << 8) |
    (digest[offset + 3]! & 0xff);
  return String(binary % 10 ** DIGITS).padStart(DIGITS, '0');
}

export interface TotpVerification {
  valid: boolean;
  counter: number;
}

/**
 * Verify a code with `window` periods of drift. Returns the matched counter so
 * the caller can enforce monotonic use; `valid` is false when nothing matches.
 */
export function verifyTotp(
  secret: string,
  code: string,
  options: { window?: number; timestampMs?: number } = {},
): TotpVerification {
  const trimmed = code.replace(/\s+/g, '');
  if (!/^\d{6}$/.test(trimmed)) {
    return { valid: false, counter: -1 };
  }
  const window = Math.max(0, Math.min(options.window ?? 1, 3));
  const base = totpCounter(options.timestampMs ?? Date.now());
  for (let offset = -window; offset <= window; offset += 1) {
    const counter = base + offset;
    if (counter < 0) continue;
    const expected = generateTotpForCounter(secret, counter);
    if (expected === trimmed) {
      return { valid: true, counter };
    }
  }
  return { valid: false, counter: -1 };
}

export function otpauthUrl(input: { secret: string; account: string; issuer?: string }): string {
  const issuer = input.issuer ?? 'MERNPress';
  const label = encodeURIComponent(`${issuer}:${input.account}`);
  const params = new URLSearchParams({
    secret: input.secret,
    issuer,
    algorithm: 'SHA1',
    digits: String(DIGITS),
    period: String(PERIOD_SECONDS),
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}
