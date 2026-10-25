import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

export function sha256Hex(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

export function generateOpaqueToken(): string {
  return randomBytes(32).toString('base64url');
}

export function safeEqualHex(left: string, right: string): boolean {
  if (!/^[0-9a-f]{64}$/i.test(left) || !/^[0-9a-f]{64}$/i.test(right)) {
    return false;
  }

  return timingSafeEqual(Buffer.from(left, 'hex'), Buffer.from(right, 'hex'));
}

export function hashSessionToken(token: string): string {
  return sha256Hex(token);
}

export function hashCsrfToken(token: string): string {
  return sha256Hex(token);
}

export function verifyCsrfToken(token: string, expectedHash: string): boolean {
  return safeEqualHex(hashCsrfToken(token), expectedHash);
}
